importScripts('./config.js', './util.js');

if(typeof(net) == 'undefined') var net = {};
if(!net.xirvik) net.xirvik = {};

net.xirvik.seedbox = (function(my) {
    my.extension = {
        options: my.conf.options_default,

        uploadFuncs: {
            'rutorrent': 'ruTorrentUpload',
            'rutorrent 3.x': 'ruTorrentUpload',
            'deluge': 'delugeUpload',
            'torrentflux-b4rt': 'torrentFluxUpload',
            'utorrent': 'uTorrentUpload',
            'qbittorrent': 'qBittorrentUpload'
        },

        loadOptions: async function() {
            if( !my.extension?.options?.loaded ) {
                await chrome.storage.sync.get().then((items) => {
                    Object.assign(my.extension.options, my.conf.options_default);
                    my.extension.options = my.merge(my.extension.options, items?.options || {});
                    my.extension.options.loaded = true;
                });
            }
            return(my.extension.options);
        },

        refererSetupFilters: async function(serverUrl, refererUrl) {
            if(!this.refererFilteredURLs[serverUrl]) {
                this.refererFilteredURLs[serverUrl] = my.basepath(refererUrl ? refererUrl : serverUrl);
                const rules = [];

                let i = 0;
                for(const url in this.refererFilteredURLs) {
                    rules.push({
                        id: ++i,
                        action: {
                            type: 'modifyHeaders',
                            requestHeaders: [{
                                header: 'Referer',
                                operation: 'set',
                                value: my.getReferer(this.refererFilteredURLs[url])
                            }, {
                                header: 'Origin',
                                operation: 'set',
                                value: my.getOrigin(this.refererFilteredURLs[url])
                            }],
                        },

                        condition: {
                            urlFilter: '|'+url+'*',
                            resourceTypes: ['xmlhttprequest'],
                            initiatorDomains: [chrome.runtime.id]
                        }
                    });
                }

                await chrome.declarativeNetRequest.updateDynamicRules({
                    removeRuleIds: rules.map(r => r.id),
                    addRules: rules
                });
            }
        },

        ruTorrentUpload: async function(server, options) {
            var url = my.addslash(server.url);
            await this.refererSetupFilters(url, url);
            var formData = new FormData();
            formData.append('dir_edit', options.directory);
            formData.append('label', options.label);
            if(options['torrents_start_stopped'])
                formData.append('torrents_start_stopped', 'on');
            if(options['not_add_path'])
                formData.append('not_add_path', 'on');
            if(options['fast_resume'])
                formData.append('fast_resume', 'on');
            if(options.magnet)
                formData.append('url', options.data);
            else {
                formData.append('torrent_file', options.data, options.name);
            }
            my.ajax({
                url: url + 'php/addtorrent.php',
                responseType: 'text',
                referrer: url,
                base: server.url,
                user: server.user,
                pass: server.pass,
                method: 'POST',
                body: formData,
                success: my.standardSuccessHandling,
                error: function(status) {
                    if(my.getOption('messageuf'))
                        my.standardErrorHandling(status, server.url, my.t('torrent_upload_fail'));
                }
            });
        },

        qBittorrentUpload: async function(server, options) {
            var url = my.addslash(server.url);
            await this.refererSetupFilters(url, url);
            my.ajax({
                url: url + 'api/v2/auth/login',
                base: server.url,
                method: 'POST',
                body: 'username=' + encodeURIComponent(server.user) + '&password=' + encodeURIComponent(server.pass),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                error: function(status) {
                    if(my.getOption('messageuf'))
                        my.standardErrorHandling(status, server.url, my.t('torrent_upload_fail'));
                },
                success: function() {
                    var path = null;
                    var formData = new FormData();
                    if(options['torrents_start_stopped'])
                        formData.append('paused', 'true');
                    if(options.magnet) {
                        formData.append('urls', options.data);
                    } else {
                        formData.append('torrents', options.data, options.name);
                    }
                    my.ajax({
                        url: url + 'api/v2/torrents/add',
                        responseType: 'text',
                        base: server.url,
                        method: 'POST',
                        body: formData,
                        success: my.standardSuccessHandling,
                        error: function(status) {
                            if(my.getOption('messageuf'))
                                my.standardErrorHandling(status, server.url, my.t('torrent_upload_fail'));
                        }
                    });
                }
            });
        },

        delugeUpload: function(server, options) {
            var url = my.addslash(server.url);

            var addTorrent2Deluge = function(contents) {
                my.ajax({
                    url: url + 'json',
                    responseType: 'json',
                    base: server.url,
                    user: server.user,
                    pass: server.pass,
                    method: 'POST',
                    body: JSON.stringify({
                        method: 'web.add_torrents',
                        params: [
                            [{
                                path: contents,
                                options: {
                                    add_paused: my.getOption('nostart'),
                                }
                            }]
                        ],
                        id: 155
                    }),
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    success: function(json) {
                        if(json.result) {
                            if(my.getOption('messageuc'))
                                my.notify('info', 'torrent_uploaded', server.url);
                        } else
                            my.standardErrorHandling(-2, server.url);
                    },
                    error: function(status) {
                        if(my.getOption('messageuf'))
                            my.standardErrorHandling(status, server.url, my.t('torrent_upload_fail'));
                    }
                });
            };

            my.ajax({
                url: url + 'json',
                responseType: 'json',
                base: server.url,
                user: server.user,
                pass: server.pass,
                method: 'POST',
                body: '{"method":"auth.login","params":["' + server.deluge_pass + '"],"id":2}',
                headers: {
                    'Content-Type': 'application/json',
                },
                error: function(status) {
                    if(my.getOption('messageuf'))
                        my.standardErrorHandling(status, server.url, my.t('torrent_upload_fail'));
                },
                success: function(json) {
                    if(json.result) {
                        if(options.magnet)
                            addTorrent2Deluge(options.data);
                        else {
                            var formData = new FormData();
                            formData.append('file', options.data, options.name);
                            my.ajax({
                                url: url + 'upload',
                                responseType: 'json',
                                base: server.url,
                                user: server.user,
                                pass: server.pass,
                                method: 'POST',
                                body: formData,
                                error: function(status) {
                                    if(my.getOption('messageuf'))
                                        my.standardErrorHandling(status, server.url, my.t('torrent_upload_fail'));
                                },
                                success: function(json) {
                                    if(json.success)
                                        addTorrent2Deluge(json['files'][0]);
                                    else
                                        my.standardErrorHandling(-2, server.url);
                                }
                            });
                        }
                    } else
                        my.standardErrorHandling(-2, server.url);
                }
            });
        },

        torrentFluxUpload: function(server, options) {
            if(options.magnet) {
                if(my.getOption('messageuf')) {
                    my.notify('error', 'tflux_not_support', server.url);
                }
            } else {
                var formData = new FormData();
                formData.append('aid', 2);
                formData.append('client', server.user);
                formData.append('upload_files[]', options.data, options.name + '.torrent');
                my.ajax({
                    url: my.addslash(server.url) + 'dispatcher.php?action=fileUpload',
                    responseType: 'text',
                    base: server.url,
                    user: server.user,
                    pass: server.pass,
                    method: 'POST',
                    body: formData,
                    success: my.standardSuccessHandling,
                    error: function(status) {
                        if(my.getOption('messageuf'))
                            my.standardErrorHandling(status, server.url, my.t('torrent_upload_fail'));
                    }
                });
            }
        },

        uTorrentUpload: function(server, options) {
            var url = my.addslash(server.url);
            my.ajax({
                url: url + 'token.html',
                responseType: 'text',
                base: server.url,
                user: server.user,
                pass: server.pass,
                success: function(text, response) {
                    var token = text.match(/<html><div id='token' style='display:none;'>(.*)<\/div><\/html>/);
                    if(token) {
                        var formData = null;
                        url += '?token=';
                        url += encodeURIComponent(token[1]);
                        if(options.magnet) {
                            url += '&action=add-url&s=';
                            url += encodeURIComponent(options.data);
                        } else {
                            url += '&action=add-file';
                            formData = new FormData();
                            formData.append('torrent_file', options.data, options.name);
                        }
                        my.ajax({
                            url: url,
                            responseType: 'text',
                            base: server.url,
                            user: server.user,
                            pass: server.pass,
                            method: 'POST',
                            body: formData,
                            success: my.standardSuccessHandling,
                            error: function(status) {
                                if(my.getOption('messageuf'))
                                    my.standardErrorHandling(status, server.url, my.t('torrent_upload_fail'));
                            }
                        });
                    } else
                        my.standardErrorHandling(-2, server.url);
                },
                error: function(status) {
                    if(my.getOption('messageuf'))
                        my.standardErrorHandling(status, server.url, my.t('torrent_upload_fail'));
                }
            });
        },

        openURL: function(url) {
            chrome.tabs.query({
                url: my.addslash(url),
                currentWindow: true
            }, function(tabs) {
                if(tabs.length)
                    chrome.tabs.update(tabs[0].id, {
                        active: true
                    });
                else
                    chrome.tabs.create({
                        'url': url
                    });
            });
        },

        isXivikConfiguration: function() {
            return (my.isXivikConfiguration(my.extension.options.servers));
        },

        setOptions: async function(options) {
            if(options) {
                my.extension.options = options;
                await chrome.storage.sync.set({ options: my.extension.options });
            }

            chrome.tabs.query({}, function(tabs) {
                for(var i = 0; i < tabs.length; i++) {
                    chrome.tabs.sendMessage(tabs[i].id, {
                        type: 'optionschanged',
                        options: my.extension.options
                    }, function() {
                        if(chrome.runtime.lastError) {
                            // console.warn('Whoops.. ' + chrome.runtime.lastError.message);
                        }
                    });
                }
            });
            my.extension.options['enabled'] ? chrome.action.enable() : chrome.action.disable();
        },

        onContextMenu: function(e) {
            (async () => {
                await my.extension.loadOptions();
            })();            

            if(e.menuItemId === 'enable') {
                my.extension.options['enabled'] = e.checked;
                my.extension.setOptions();
                my.extension.makeMenu();
            } else {
                var server = null;
                for(var i = 0; i < my.extension.options.servers.length; i++) {
                    if(my.extension.options.servers[i].menu == e.menuItemId) {
                        server = my.extension.options.servers[i];
                        break;
                    }
                }
                if(server) {
                    chrome.tabs.query({
                        currentWindow: true,
                        active: true
                    }, function(tabs) {
                        my.extension.transfer(server, {
                            data: e.linkUrl,
                            id: tabs[0].id,
                            referer: tabs[0].url
                        });
                    });
                }
            }
            return(true);
        },

        createContextMenuItem: function(index, root) {
            var server = this.options.servers[index];
            var name = server.descr.length ? server.descr : my.getHost(server.url) + ' (' + server.client + ')';
            if(this.options.servers.length == 1)
                name = my.t('upload_to') + name;
            var options = {
                id: name,
                title: name,
                contexts: ['link'],
                parentId: root
            };
            if(this.options.capture == 0)
                options.targetUrlPatterns = ['*://*/*.torrent*'];
            server.menu = chrome.contextMenus.create(options);
        },

        makeMenu: function() {
            chrome.contextMenus.removeAll();
            if((this.options.capture <= 1) && this.options.enabled && this.options.servers.length) {
                if(this.options.servers.length == 1)
                    this.createContextMenuItem(0);
                else {
                    var options = {
                        id: 'servers',
                        type: 'normal',
                        title: my.t('upload_to_seedbox'),
                        contexts: ['link']
                    };
                    if(this.options.capture == 0)
                        options.targetUrlPatterns = ['*://*/*.torrent*'];
                    var root = chrome.contextMenus.create(options, function() {
                        for(var i = 0; i < my.extension.options.servers.length; i++)
                            my.extension.createContextMenuItem(i, root);
                    });
                }
            }
            chrome.contextMenus.create({
                id: 'enable',
                title: my.t('enable'),
                contexts: ['action'],
                type: 'checkbox',
                checked: my.getOption('enabled'),
            });
        },

        requestHandler: function(request, sender, sendResponse) {
            switch(request.type) {
                case 'ping': {
                    sendResponse('pong');
                    break;
                }
                case 'setoptions': {
                    (async () => {
                        await my.extension.setOptions(request.options);
                        my.extension.makeMenu();
                        sendResponse({});
                    })();
                    break;
                }
                case 'getoptions': {
                    (async () => {
                        await my.extension.loadOptions();
                        sendResponse(my.extension.options);
                    })();
                    break;
                }
                case 'load': {
                    (async () => {
                        await my.extension.loadOptions();
                        my.extension.retrieveServer(sender.tab.id, request.url, false);
                    })();
                    break;
                }
                case 'notification': {
                    my.extension.showNotification(request.theme, request.text, request.url);
                    break;
                }
                case 'ajax': {
                    my.ajax(
                        my.merge(request.options, {
                            responseType: 'json',
                            success: function(json) {
                                chrome.tabs.sendMessage(sender.tab.id, {
                                    type: 'ajax',
                                    success: true,
                                    ret: json
                                });
                            },
                            error: function(status) {
                                chrome.tabs.sendMessage(sender.tab.id, {
                                    type: 'ajax',
                                    success: false,
                                    ret: status
                                });
                            }
                        })
                    );
                    break;
                }
            }
            return(true);
        },

        showNotification: function(theme, text, url) {
            chrome.notifications.create({
                title: theme,
                type: 'basic',
                message: text,
                iconUrl: chrome.runtime.getURL('images/xirvik-32.png')
            }, function(id) {
                my.extension.notifications[id] = {
                    url: url
                };
                setTimeout(function() {
                    chrome.notifications.clear(id);
                    delete my.extension.notifications[id];
                }, my.conf.notificationDelay);
            });
        },

        download: async function(options, callback, server) {
            if(options.magnet = ((typeof(options.data) == 'string') && options.data.match(/^magnet:/i)))
                callback(options);
            else {
                if(my.getOption('messageds'))
                    my.notify('info', 'starting_torrent_download', server.url);
                if(options['referer']) {
                    await this.refererSetupFilters(my.basepath(options.data), options['referer']);
                }
                my.ajax({
                    url: options.data,
                    responseType: 'blob',

                    success: function(blob, response) {
                        options.name = 'dummy.torrent';

                        var hdr = response.headers.get('Content-Disposition');
                        if(hdr) {
                            hdr = hdr.match(/filename='(.*)'/);
                            if(hdr)
                                options.name = hdr[1];
                        }
                        options.url = options.data;
                        options.data = blob;
                        my.bencode(options.data, function(info) {
                                options.info = info;
                                callback(options);
                            },
                            function() {
                                if(my.getOption('messagedf'))
                                    my.standardErrorHandling(-2, server.url, my.t('download_not_torrent'));
                            });

                    },
                    error: function(status) {
                        if(my.getOption('messagedf'))
                            my.standardErrorHandling(status, server.url, my.t('download_error'));
                    }
                });
            }
        },

        transfer: function(server, options) {
            my.extension.download(options, function(options) {
                my.extension.retrieveOptions(server, options, my.extension.upload);
            }, server);
        },

        retrieveServer: function(tabId, url, referer) {
            chrome.tabs.sendMessage(tabId, {
                type: 'dialog',
                name: 'seedboxes'
            }, function(data) {
                if(data) {
                    var server = my.extension.options.servers[data.index];
                    my.extension.transfer(server, {
                        data: url,
                        id: tabId,
                        referer: referer
                    });
                }
            });
        },

        retrieveOptions: async function(server, options, callback) {
            options.torrents_start_stopped = my.getOption('nostart');
            switch(server.client) {
                case 'rutorrent':
                case 'rutorrent 3.x': {
                    var replacement = {};
                    if(!options.magnet) {
                        if((server.dir_type == 'Permanent') || (server.label_type == 'Permanent'))
                            replacement = options.info;
                        replacement['{HOST}'] = my.getHost(options.url);
                    }
                    replacement['{DATE}'] = (new Date()).toISOString().substr(0, 10);
                    replacement['{HOST}'] = replacement['{HOST}'] || '';
                    replacement['{TRACKER}'] = replacement['{TRACKER}'] || '';
                    replacement['{CREATION}'] = replacement['{CREATION}'] || '';

                    if(server.dir_type == 'Permanent') {
                        options.directory = server.dir;
                        for(var i in replacement) {
                            var r = new RegExp(i, 'ig');
                            options.directory = options.directory.replace(r, replacement[i]);
                        }
                    } else
                        options.directory = '';
                    if(server.label_type == 'Permanent') {
                        options.label = server.label;
                        for(var i in replacement) {
                            var r = new RegExp(i, 'ig');
                            options.label = options.label.replace(r, replacement[i]);
                        }
                    } else
                        options.label = '';

                    var modes = [];
                    if((server.dir_type == 'At runtime') || (server.dir_type == 'Permanent'))
                        modes.push('dirlist');
                    if(server.label_type == 'At runtime')
                        modes.push('labels');
                    if(modes.length) {
                        var url = my.addslash(server.url);
                        await my.extension.refererSetupFilters(url, url);
                        my.ajax({
                            url: url + 'plugins/_getdir/info.php?mode=' + modes.join(';'),
                            responseType: 'json',
                            base: server.url,
                            user: server.user,
                            pass: server.pass,
                            success: function(ret) {
                                ret['basedir'] ||= '';
                                if((server.label_type == 'At runtime') || (server.dir_type == 'At runtime')) {
                                    var props = {
                                        type: 'dialog',
                                        name: 'upload_options',
                                    };
                                    if(server.label_type == 'At runtime')
                                        props.labels = ret.labels;
                                    if(server.dir_type == 'At runtime') {
                                        props.dirlist = ret.dirlist;
                                        props.basedir = ret.basedir;
                                        props.server = server;
                                    }

                                    chrome.tabs.sendMessage(options.id, props, function(data) {
                                        if(data) {
                                            options.label = data.label || options.label;
                                            options.directory = data.directory.length ? my.addslash(ret.basedir) + data.directory : my.addslash(ret.basedir) + options.directory;
                                            options.torrents_start_stopped = data.torrents_start_stopped;
                                            options.fast_resume = data.fast_resume;
                                            options.not_add_path = data.not_add_path;
                                            callback(server, options);
                                        }
                                    });
                                } else {
                                    options.directory = my.addslash(ret.basedir) + options.directory;
                                    callback(server, options);
                                }
                            },
                            error: function(status) {
                                callback(server, options);
                            }
                        });
                        break;
                    }
                }
                default: {
                    callback(server, options);
                    break;
                }
            }
        },

        upload: function(server, options) {
            if(my.getOption('messageus'))
                my.notify('info', 'starting_torrent_upload', server.url);
            if(my.extension.uploadFuncs[server.client]) {
                my.extension[my.extension.uploadFuncs[server.client]](server, options);
            } else
            if(my.getOption('messageuf'))
                my.notify('error', 'Upload function not found.', server.url);
        },

        onNotificationClick: function(id) {
            var notification = my.extension.notifications[id];
            if(notification) {
                chrome.notifications.clear(id);
                if(notification.url)
                    my.extension.openURL(notification.url);
                delete my.extension.notifications[id];
            }
        },

        setupNotifications: function() {
            this.notifications = {};
            chrome.notifications.onClicked.addListener(this.onNotificationClick);
        },

        init: async function() {
            chrome.contextMenus.onClicked.addListener(my.extension.onContextMenu);
            chrome.runtime.onMessage.addListener(my.extension.requestHandler);
            my.extension.setupNotifications();
            my.extension.refererFilteredURLs = {};
            await my.extension.loadOptions();
            my.extension.makeMenu();
            my.extension.setOptions();
        }
    };

    my.extension.init();
    return (my);
})(net.xirvik.seedbox || {});
