(function() {

    var RECONNECT_AFTER_MS = 5000;

    var port = null;
    var waitingCommandRequests = [];
    var notificationElement = null;

    var STATE_DISCONNECTED = 0;
    var STATE_CONNECTED = 1;
    var STATE_VERIFIED = 2;
    var connectionState = STATE_DISCONNECTED;

    
    function log(message) {
        chrome.runtime.sendMessage({ type: "log", message: message }, function (response) {
            console.log(response.farewell);
        });
    }

    function getSubdomain() {
        var regexParse = new RegExp('[a-z\-0-9]{2,63}\.[a-z\.]{2,5}$');
        var urlParts = regexParse.exec(window.location.hostname);
        return window.location.hostname.replace(urlParts[0], '').slice(0, -1);
    }

    function closeNotification() {
        if (notificationElement) {
            document.querySelector("body").removeChild(notificationElement);
        }
    }

    function notification(title, content) {
        if (!notificationElement) {
            notificationElement = document.createElement("div");
            var notificationClose = document.createElement("div");
            notificationClose.className = "close-notification";
            notificationClose.innerText = "x";
            notificationClose.onclick = function() {
                closeNotification();
            };

            notificationElement.id = "windows-tray-notification";
            notificationElement.innerHTML = '<div class="title"></div><div class="content"></div>';
            notificationElement.appendChild(notificationClose);
            document.querySelector("body").appendChild(notificationElement);
        }

        notificationElement.querySelector(".title").innerHTML = "<h3>" + title + " - Slack Windows Tray</h3>";
        notificationElement.querySelector(".content").innerHTML = content;
    }

    function getChats(kind) {
		return Array.prototype.slice.call(document.querySelectorAll("#channels_scroller li." + kind));
	}

    function generateUUID() {
        var d = new Date().getTime();
        var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = (d + Math.random() * 16) % 16 | 0;
            d = Math.floor(d / 16);
            return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
        return uuid;
    };

    function sendUpdatesWhileConnected() {

        setTimeout(sendUpdatesWhileConnected, 5000);
        if (connectionState != STATE_VERIFIED) {
            return;
        }

        var allChats = getChats("channel");
        allChats = allChats.concat(getChats("group"));
        allChats = allChats.concat(getChats("member"));
        var chatStatus = allChats.map(function (element) {

            var channelName;
            try {
            	var aElement = element.querySelector("a");
                channelName = aElement.getAttribute("data-channel-id");
                channelName = channelName || aElement.getAttribute("data-group-id");
                channelName = channelName || aElement.getAttribute("data-member-id");
                
                if(channelName === null) {
                	throw new Error("Failed to get ID");
                }
            } catch (err) {
                console.log("SlackWindwowsTray: Failed to get channel name: " + err);
                channelName = "EXT-ERROR";
            }

            return {
                name: channelName,
                unread: element.classList.contains("unread"),
                mention: element.classList.contains("mention")
            };
        });

        port.postMessage({
            command: "chat-state",
            body: chatStatus
        });
    }
    

    function sendCommandWaitReply(command) {
        log("sendCommandWaitReply - Command: " + command);
        if (port == null) {
            log("sendCommandWaitReply - Port disconnected, command will not execute");
            Q.reject("Disconnected");
        }
        
        var thread = generateUUID();
        port.postMessage({ command: command, thread: thread });
        
        return waitForCommand(command, thread);
    }

    // threadId - Optional
    function waitForCommand(command, thread) {
        thread = thread || null;

        var deferred = Q.defer();

        log("waitForCommand - Command: '" + command + "' Thread: '" + thread + "'");

        var waitFor = {
            command: command,
            thread: thread,
            deferred: deferred
        };

        waitingCommandRequests.push(waitFor);

        return deferred.promise;
    }
    
    function onPortDisconnect() {
        log("onPortDisconnect - Port disconnected, queuing to reconnect in " + RECONNECT_AFTER_MS + "ms");
        port = null;
        connectionState = STATE_DISCONNECTED;
        // Reconnect after X seconds
        setTimeout(connect, RECONNECT_AFTER_MS);

        _.each(waitingCommandRequests, function(request) {
            log("onPortDisconnect - Rejecting a waiting request: " + JSON.stringify(request));
            request.deferred.reject();
        });

        log("onPortDisconnect - Clearing all waiting requests");
        waitingCommandRequests.length = 0;
    }

    function onPortMessage(message) {
        log("onPortMessage - Message:" + JSON.stringify(message));
        var waitingCommandRequest = _.find(waitingCommandRequests, { command: message.command, thread: message.thread });
        if (waitingCommandRequest) {
            log("onPortMessage - Found waiting command request. Resolving...");
            _.pull(waitingCommandRequests, waitingCommandRequest);
            waitingCommandRequest.deferred.resolve(message);
        }

        // In the future, we might handle command that we're not waiting for (that were initiated in the app)
    }

    // Sends a messages and resolves when connected
    function connect() {
        log("connect - Connecting...");

        port = chrome.runtime.connect({ name: getSubdomain() });
        port.onDisconnect.addListener(onPortDisconnect);
        port.onMessage.addListener(onPortMessage);

        setTimeout(function() {
            if(connectionState == STATE_DISCONNECTED) {
                notification("Failed to connect",
                    "<p>Is Slack Windows Notifier running?</p>" +
                    '<p>If you don\'t have it, the latest version is <a href="https://github.com/vitalybe/windows-slack-notifier/releases" target="_blank">here</a>, ' +
                    'run it and refresh Slack.</p>'
                    );
            }
        }, 5000);

        var extensionVersion = chrome.runtime.getManifest().version;
        return waitForCommand("connected")
            .then(function() {
                log("connect - Connected. Requesting version...");
                return sendCommandWaitReply("version").catch(function() {
                    connectionState = STATE_CONNECTED;
                    log("connect - Disconnected after requesting a version, probably old app version");
                    // This will occur when the app closed the connection after the `version` command was sent
                    // It is probably that it will happen due to an old version
                    notification("Update possibly required",
                        "<p>Failed to get app version, this might be due to an older version.</p>" +
                        "<p><b>Extension version</b>: " + extensionVersion + "</p>" +
                        '<p>Download the latest version <a href="https://github.com/vitalybe/windows-slack-notifier/releases" target="_blank">here</a>, ' +
                        'run it and refresh Slack.</p>'
                        );

                    throw new Error("Failed to connect");
                });
            })
            .then(function(versionReply) {
                var appVersion = versionReply.body;
                log("connect - App version: " + appVersion);
                log("connect - Extension version: " + extensionVersion);
                if (appVersion === extensionVersion) {
                    log("connect - Versions match, connected successfully");
                    connectionState = STATE_VERIFIED;
    
                    // In case notification "connection failed" notification was shown
                    closeNotification(); 
                } else {
                    log("connect - Versions mismatch, showing notification");
                    notification("Update required",
                        "<p><b>Extension version</b>: " + extensionVersion + "</p>" +
                        "<p><b>App version</b>: " + appVersion + "</p>"
                    );
                }
            });
    }

    connect();
    sendUpdatesWhileConnected();

})();