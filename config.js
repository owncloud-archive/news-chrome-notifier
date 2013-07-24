function start() {
	var url_input = document.getElementById("url");
	var un_input = document.getElementById("username");
	var url = localStorage["oc_url"];
	var un = localStorage["oc_un"];
	if (url != null) {
		url_input.value = url;
	}
	if (un != null) {
		un_input.value = un;
	}
	var form = document.getElementById("form");
	form.addEventListener("submit", handleClick);
}

function handleClick(event) {
	var input = document.getElementById("url");
	var url = input.value;
	if (url[url.length - 1] != '/') {
		url = url + "/";
	}
	localStorage["oc_url"] = url;
	localStorage["oc_un"] = document.getElementById("username").value;
	localStorage["oc_pw"] = document.getElementById("password").value;
	event.preventDefault();
}

document.addEventListener('DOMContentLoaded', start);
