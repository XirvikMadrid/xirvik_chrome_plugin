if(typeof(net) == 'undefined') var net = {};
if(!net.xirvik) net.xirvik = {};

net.xirvik.seedbox = (function(my) {
    my.extension = {
        options: my.conf.default_options,

        init: function() {
            chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
                if(request.type == 'optionschanged')
                    my.extension.options = request.options;
            });
        },

        ping: function(callback) {
            chrome.runtime.sendMessage({
                type: 'ping'
            }, function(response) {
                if(chrome.runtime.lastError) {
                    setTimeout(my.extension.ping, 300, callback);
                } else {
                    if(callback)
                        callback();
                }
            });
        },

        load: function(callback) {
            chrome.runtime.sendMessage({
                type: 'getoptions'
            }, function(response) {
                my.extension.options = response;
                my.log('Options was retrieved.');
                for(let i = 0; i < my.extension.options.servers.length; i++) {
                    delete my.extension.options.servers[i].menu;
                }
                if(callback)
                    callback(my.extension.options);
            });
        },

        store: function(callback) {
            chrome.runtime.sendMessage({
                type: 'setoptions',
                options: this.options
            }, callback);
        },

        configInProgress: false,

        makeAutoConf: function(url) {
            if(!my.extension.configInProgress && my.extension.options.enabled) {
                my.extension.configInProgress = true;

                my.ajax({
                    url: url,
                    responseType: 'text',

                    success: function(text, response) {
                        let xml = null;
                        let user = null;
                        let pass = null;
                        const contentType = response.headers.get('Content-Type');

                        if(contentType === 'application/seedboxconfig') {
                            const authorization = response.headers.get('Authorization-Echo');
                            if(authorization) {
                                const credentials = (atob(authorization) || '').split(':');
                                if(credentials.length === 2) {
                                    try { xml = $.parseXML(text); } catch(e) { xml = null };
                                    if(xml)
                                        my.extension.parseConfigXML(xml, credentials[0], credentials[1]);
                                    else
                                        my.notify("error", "autoconfiguration_failed");
                                }
                            }
                        }
                        my.extension.configInProgress = false;
                    },

                    error: function() {
                        my.notify("error", "autoconfiguration_failed");
                        my.extension.configInProgress = false;
                    }
                });
            }
        },

        parseConfigXML: function(xml, user, pass) {
            xml = xml.documentElement;
            let success = 0;
            if((xml.nodeName == "autoconf") && (xml.getAttribute("name") == "xirvik")) {
                const servers = xml.getElementsByTagName("server");
                for(let i = 0; i < servers.length; i++) {
                    const server = servers[i];
                    const optiontags = server.getElementsByTagName("option");
                    let host = "",
                        username = "",
                        passwd = "",
                        description = "",
                        client = "";
                    for(let k = 0; k < optiontags.length; k++) {
                        const value = optiontags[k].getAttribute("value");
                        switch(optiontags[k].getAttribute("name")) {
                            case "host": {
                                host = value;
                                break;
                            }
                            case "username": {
                                username = value;
                                break;
                            }
                            case "pass": {
                                passwd = value;
                                break;
                            }
                            case "description": {
                                description = value;
                                break;
                            }
                            case "client": {
                                client = (value == 'rutorrent 3.x') ? 'rutorrent' : value;
                                break;
                            }
                        }
                    }
                    let tmphost = host;
                    if((!tmphost.length || (tmphost == "/") || (tmphost == "\\")) &&
                        !window.confirm("[" + host + "]: " + my.t('seedbox_incorrect_path')))
                        return;
                    if(!i) {
                        tmphost = my.getHost(tmphost);

                        let found = false;
                        for(let j = 0; j < my.extension.options.servers.length; j++) {
                            if(my.getHost(my.extension.options.servers[j].url) == tmphost) {
                                found = true;
                                break;
                            }
                        }
                        if(found && !window.confirm("[" + tmphost + "]: " + my.t('seedbox_data_found')))
                            return;

                        for(let j = 0; j < my.extension.options.servers.length;) {
                            if(my.getHost(my.extension.options.servers[j].url) == tmphost)
                                my.extension.options.servers.splice(j, 1);
                            else
                                j++;
                        }
                    }
                    if(!username && user && user.length)
                        username = user;
                    if(!passwd && pass && pass.length)
                        passwd = pass;

                    my.extension.options.servers.push({
                        pass: passwd,
                        descr: description,
                        url: host,
                        user: username,
                        client: client
                    });
                    success++;
                }
            }
            if(success) {
                my.extension.store(function() {
                    my.notify("info", my.t("autoconfiguration_succeeded") + success);
                });
            } else {
                my.notify("error", "autoconfiguration_failed");
            }
        },

    };

    my.extension.init();

    return (my);
})(net.xirvik.seedbox || {});
