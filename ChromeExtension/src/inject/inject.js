(function() {

    function notification() {

        var notificationElement = document.createElement("div");
        notificationElement.innerHTML = "<h4>Update required - Slack Windows Tray</h4><p>OKAY</p>";
        notificationElement.id = "windows-tray-notification";
        document.querySelector("body").appendChild(notificationElement);
    }

    function getChats(kind) {
		return Array.prototype.slice.call(document.querySelectorAll("#channels_scroller li." + kind));
	}

    setInterval(function() {

        var allChats = getChats("channel");
        allChats = allChats.concat(getChats("group"));
        allChats = allChats.concat(getChats("member"));
        var chatStatus = allChats.map(function (element) {

            var channelName;
            try {
                channelName = element.querySelector(".overflow_ellipsis").innerText.trim().replace("# ", "#");
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

        chrome.extension.sendMessage(chatStatus);

    }, 1000);
})();