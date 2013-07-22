function start() {
	var input = document.getElementById("url");
	var url = localStorage["oc_url"];
	if (url != null) {
		input.value = url;
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
	event.preventDefault();
}

document.addEventListener('DOMContentLoaded', start);

