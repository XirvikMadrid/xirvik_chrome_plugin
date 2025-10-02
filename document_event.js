if(typeof(net) == 'undefined') var net = {};
if(!net.xirvik) net.xirvik = {};

net.xirvik.seedbox = (function(my) {
    my.contextmenu = {
        init: function() {
            document.addEventListener('click', this.onClick, true);
        },

        onClick: function(e) {
            const mayHandleTorrentClick = (my.extension.options.servers.length && my.extension.options.click);
            const mayHandleAutoConf = (document.location.host.indexOf(my.conf.xirvikDomain) > 0);

            if((e.which == 1) && !e.metaKey && !e.shiftKey && !e.ctrlKey && !e.altKey && 
                my.extension.options.enabled && (mayHandleTorrentClick || mayHandleAutoConf)) {
                let target = e.target;
                while(target && target.tagName && (target.tagName.toLowerCase() != 'a'))
                    target = target.parentNode;
                if(target && target.href) {

                    const mayAutoConf = target.href.match(my.conf.confFilter);
                    if(mayHandleAutoConf && mayAutoConf) {
                        e.preventDefault();
                        e.stopPropagation();
                        my.extension.makeAutoConf(target.href);
                        return(false);
                    }

                    const mayLoad = target.href.match(/^magnet:/i) || target.href.match(/.[^?]\.torrent(\?|$)/i);
                    if(mayLoad && mayHandleTorrentClick) {
                        e.preventDefault();
                        e.stopPropagation();
                        chrome.runtime.sendMessage({
                            type: 'load',
                            url: target.href
                        });
                        return(false);
                    }
                }
            }
        },
    };

    my.theFileCache = {
        server: null,
        url: null,
        entries: {},
        basedir: null,

        init: function(server, basedir, dirlist) {
            this.basedir = my.addslash(basedir);
            this.server = server;
            this.url = my.addslash(this.server.url) + 'plugins/_getdir/info.php?mode=dirlist&basedir=';
            this.entries = {};
            this.entries[''] = dirlist;
        },

        get: function(basedir, callback) {
            basedir = my.normalize(basedir);
            if(this.entries[basedir])
                callback(basedir, this.entries[basedir]);
            else {
                const timeout = setTimeout(function() {
                    $.fancybox.showLoading();
                }, 500);

                const ajaxResponse = function(request, sender, sendResponse) {
                    if(request.type == 'ajax') {
                        clearTimeout(timeout);
                        $.fancybox.hideLoading();
                        if(request.success) {
                            const directory = my.addslash(request.ret.basedir.substr(my.theFileCache.basedir.length));
                            my.theFileCache.entries[directory] = request.ret.dirlist;
                            callback(directory, request.ret.dirlist);
                        } else {
                            if(my.getOption('messagedf'))
                                my.standardErrorHandling(request.ret, my.theFileCache.url);
                        }
                        chrome.runtime.onMessage.removeListener(ajaxResponse);
                    }
                };

                chrome.runtime.onMessage.addListener(ajaxResponse);
                //my.extension.ping(function() {
                chrome.runtime.sendMessage({
                    type: 'ajax',
                    options: {
                        url: this.url + encodeURIComponent(my.theFileCache.basedir + basedir),
                        base: this.url,
                        user: this.server.user,
                        pass: this.server.pass,
                    }
                });
                //});
            }
        }
    },

    my.dialogs = {
        init: function() {
            chrome.runtime.onMessage.addListener(this.onDialog);
        },

        fillDirList: function(basedir, dirlist) {
            basedir = my.normalize(basedir);
            $('.xirvik-dlg fieldset #directory').val(basedir);
            for(let i in dirlist) {
                $('.xirvik-dlg fieldset label#dirlist').append($('<label>').text(dirlist[i]));
            }
            $('.xirvik-dlg fieldset label#dirlist label').click(function() {
                $('.xirvik-dlg fieldset label#dirlist label').removeClass('active');
                $(this).addClass('active');
                $('.xirvik-dlg fieldset #directory').val(basedir + $(this).text());
            });
            $('.xirvik-dlg fieldset label#dirlist label').dblclick(function() {
                if($(this).text() != '.') {
                    $('.xirvik-dlg fieldset label#dirlist').empty();
                    my.theFileCache.get(basedir + $(this).text(), my.dialogs.fillDirList);
                }
            });
        },

        onDialog: function(request, sender, sendResponse) {
            if(request.type == 'dialog') {
                if((my.extension.options.servers.length == 1) && (request.name == 'seedboxes')) {
                    sendResponse({
                        index: 0
                    });
                } else {
                    $.fancybox({
                        type: 'ajax',
                        openEffect: 'none',
                        closeEffect: 'none',
                        href: chrome.runtime.getURL(request.name + '.html'),
                        minHeight: 50,
                        width: 400,
                        closeBtn: false,
                        scrolling: false,
                        autoCenter: true,
                        helpers: {
                            overlay: {
                                closeClick: false,
                                css: {
                                    background: 'none'
                                }
                            }
                        },
                        beforeShow: function(links, index) {
                            my.i18n();
                            for(let i in my.extension.options.servers) {
                                const server = my.extension.options.servers[i];
                                const name = server.descr.length ? server.descr : my.getHost(server.url) + ' (' + server.client + ')';
                                $('.xirvik-dlg #seedboxes').append($('<option>', {
                                    value: i
                                }).text(name));
                            }
                            if(request.labels) {
                                let founded = false;
                                for(let i in request.labels) {
                                    const label = request.labels[i];
                                    const txt = (label.length > 23) ? label.substr(0, 20) + '...' : label;
                                    $('.xirvik-dlg #existinglabels').append($('<option>', {
                                        value: label
                                    }).text(txt));
                                    founded = true;
                                }
                                if(!founded)
                                    $('.xirvik-dlg #existinglabels_cont').hide();
                            } else
                                $('.xirvik-dlg #labels').hide();
                            if(request.dirlist) {
                                my.theFileCache.init(request.server, request.basedir, request.dirlist)
                                my.dialogs.fillDirList('', request.dirlist);
                            } else
                                $('.xirvik-dlg #directories').hide();
                            $('.xirvik-dlg #torrents_start_stopped').attr('checked', my.extension.options.nostart);
                            $('.xirvik-dlg button.cancel').click(function() {
                                $.fancybox.close();
                            });
                            $('.xirvik-dlg button.ok').click(function() {
                                switch(request.name) {
                                    case 'seedboxes': {
                                        sendResponse({
                                            index: $('.xirvik-dlg #seedboxes').val()
                                        });
                                        break;
                                    }
                                    case 'upload_options': {
                                        let label = $.trim($('.xirvik-dlg #newlabel').val());
                                        if(!label.length)
                                            label = $('.xirvik-dlg #existinglabels').val();
                                        if(!label)
                                            label = '';
                                        const dir = $.trim($('.xirvik-dlg #directory').val());
                                        sendResponse({
                                            'label': label,
                                            'directory': dir,
                                            'fast_resume': $('.xirvik-dlg #fast_resume').is(':checked'),
                                            'torrents_start_stopped': $('.xirvik-dlg #torrents_start_stopped').is(':checked'),
                                            'not_add_path': $('.xirvik-dlg #not_add_path').is(':checked'),
                                        });
                                        break;
                                    }
                                }
                                $.fancybox.close();
                            });
                        }
                    });
                }
                return (true);
            }
        }
    };

    //my.extension.ping(function() {
    my.extension.load(function() {
        my.dialogs.init();
        my.contextmenu.init();
    });
    //});

    return (my);
})(net.xirvik.seedbox || {});
