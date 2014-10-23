// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

var animationFrames = 36;
var animationSpeed = 10; // ms
var canvas = document.getElementById('canvas');
var loggedInImage = document.getElementById('logged_in');
var canvasContext = canvas.getContext('2d');
var pollIntervalMin = 1;  // 1 minutes
var pollIntervalMax = 2;  // 2 minutes
var requestTimeout = 1000 * 2;  // 2 seconds
var rotation = 0;
var loadingAnimation = new LoadingAnimation();
var backgroundStarted = false;

// Legacy support for pre-event-pages.
var oldChromeVersion = !chrome.runtime;
var requestTimerId;

function getOwnCloudNewsUrl() {
	if (localStorage["oc_url"] != null) {
		if ((localStorage["oc_un"] != "") && (localStorage["oc_pw"] != "")) {
			return localStorage["oc_url"].replace(/\:\/\//, '://'+
				localStorage["oc_un"]+":"+localStorage["oc_pw"]+'@');
		} else {
			return localStorage["oc_url"];
		}
	} else {
		console.log('No ownCloud URL set');
	}
}

function getFeedUrl() {
	return getOwnCloudNewsUrl() + "api/v1-2/feeds";
}

function isOwnCloudNewsUrl(url) {
	// Return whether the URL starts with the ownCloud News prefix.
	return url.indexOf(getOwnCloudNewsUrl()) == 0;
}

// A "loading" animation displayed while we wait for the first response from
// ownCloud. This animates the badge text with a dot that cycles from left to
// right.
function LoadingAnimation() {
	this.timerId_ = 0;
	this.maxCount_ = 8;  // Total number of states in animation
	this.current_ = 0;  // Current state
	this.maxDot_ = 4;  // Max number of dots in animation
}

LoadingAnimation.prototype.paintFrame = function() {
	var text = "";
	for (var i = 0; i < this.maxDot_; i++) {
		text += (i == this.current_) ? "." : " ";
	}
	if (this.current_ >= this.maxDot_)
		text += "";

	chrome.browserAction.setBadgeText({text:text});
	this.current_++;
	if (this.current_ == this.maxCount_)
		this.current_ = 0;
}

LoadingAnimation.prototype.start = function() {
	if (this.timerId_)
		return;

	var self = this;
	this.timerId_ = window.setInterval(function() {
		self.paintFrame();
	}, 100);
}

LoadingAnimation.prototype.stop = function() {
	if (!this.timerId_)
		return;

	window.clearInterval(this.timerId_);
	this.timerId_ = 0;
}

function updateIcon() {
	if (!localStorage.hasOwnProperty('unreadCount')) {
		chrome.browserAction.setIcon({path:"owncloud_not_logged_in.png"});
		chrome.browserAction.setBadgeBackgroundColor({color:[190, 190, 190, 230]});
		chrome.browserAction.setBadgeText({text:"?"});
	} else {
		chrome.browserAction.setIcon({path: "owncloud_logged_in.png"});
		chrome.browserAction.setBadgeBackgroundColor({color:[208, 0, 24, 255]});
		chrome.browserAction.setBadgeText({
			text: localStorage.unreadCount != "0" ? localStorage.unreadCount : ""
		});
	}
}

function scheduleRequest() {
	console.log('scheduleRequest');
	var randomness = Math.random() * 2;
	var exponent = Math.pow(2, localStorage.requestFailureCount || 0);
	var multiplier = Math.max(randomness * exponent, 1);
	var delay = Math.min(multiplier * pollIntervalMin, pollIntervalMax);
	delay = Math.round(delay);
	console.log('Scheduling for: ' + delay);

	if (oldChromeVersion) {
		if (requestTimerId) {
			window.clearTimeout(requestTimerId);
		}
		requestTimerId = window.setTimeout(onAlarm, delay*60*1000);
	} else {
		console.log('Creating alarm');
		// Use a repeating alarm so that it fires again if there was a problem
		// setting the next alarm.
		chrome.alarms.create('refresh', {periodInMinutes: delay});
	}
}

// ajax stuff
function startRequest(params) {
	// Schedule request immediately. We want to be sure to reschedule, even in the
	// case where the extension process shuts down while this request is
	// outstanding.
	if (params && params.scheduleRequest) scheduleRequest();

	function stopLoadingAnimation() {
		if (params && params.showLoadingAnimation) loadingAnimation.stop();
	}

	if (params && params.showLoadingAnimation)
		loadingAnimation.start();

	getInboxCount(
		function(count) {
			stopLoadingAnimation();
			updateUnreadCount(count);
		},
		function() {
			stopLoadingAnimation();
			delete localStorage.unreadCount;
			updateIcon();
		}
	);
}

function getInboxCount(onSuccess, onError) {
	var xhr = new XMLHttpRequest();
	var abortTimerId = window.setTimeout(function() {
		xhr.abort();  // synchronously calls onreadystatechange
	}, requestTimeout);

	function handleSuccess(count) {
		localStorage.requestFailureCount = 0;
		window.clearTimeout(abortTimerId);
		if (onSuccess)
			onSuccess(count);
	}

	var invokedErrorCallback = false;
	function handleError() {
		++localStorage.requestFailureCount;
		window.clearTimeout(abortTimerId);
		if (onError && !invokedErrorCallback)
			onError();
		invokedErrorCallback = true;
	}

	try {
		xhr.onreadystatechange = function() {
			if (xhr.readyState != 4)
				return;
			if ((xhr.status == 200) && (xhr.response)) {
				var count = 0;
				var obj = JSON.parse(xhr.response);
				if (obj.feeds) {
					for (var i in obj.feeds) {
						count += obj.feeds[i].unreadCount
					}
					handleSuccess(count+'');
				} else {
					console.error(chrome.i18n.getMessage("owncloudnewscheck_node_error"));
				}
				return;
			} else if (xhr.status == 401) {
				console.error(chrome.i18n.getMessage("owncloudnewscheck_login_error"));
			} else {
				console.error(chrome.i18n.getMessage("owncloudnewscheck_ajax_error"));
			}

			handleError();
		};

		xhr.onerror = function(error) {
			handleError();
		};

		xhr.open("GET", getFeedUrl(), true);
		xhr.send(null);
	} catch(e) {
		console.error(chrome.i18n.getMessage("owncloudnewscheck_exception", e));
		handleError();
	}
}

function updateUnreadCount(count) {
	var changed = localStorage.unreadCount != count;
	localStorage.unreadCount = count;
	updateIcon();
	if (changed)
		animateFlip();
}

function ease(x) {
	return (1-Math.sin(Math.PI/2+x*Math.PI))/2;
}

function animateFlip() {
	rotation += 1/animationFrames;
	drawIconAtRotation();

	if (rotation <= 1) {
		setTimeout(animateFlip, animationSpeed);
	} else {
		rotation = 0;
		updateIcon();
	}
}

function drawIconAtRotation() {
	canvasContext.save();
	canvasContext.clearRect(0, 0, canvas.width, canvas.height);
	canvasContext.translate(
			Math.ceil(canvas.width/2),
			Math.ceil(canvas.height/2));
	canvasContext.rotate(2*Math.PI*ease(rotation));
	canvasContext.drawImage(loggedInImage,
			-Math.ceil(canvas.width/2),
			-Math.ceil(canvas.height/2));
	canvasContext.restore();

	chrome.browserAction.setIcon({imageData:canvasContext.getImageData(0, 0,
			canvas.width,canvas.height)});
}

function goToInbox() {
	if ((localStorage['oc_url'] == '') || (!localStorage.hasOwnProperty('oc_url'))) {

	  chrome.tabs.query({}, function (tabs) {
	    var i, tab;
			for (i = 0; tab = tabs[i]; i++) {
				if (tab.url && isExtOptionPageUrl(tab.url)) {
					console.log('Found ownCloud extension option tab: ' + tab.url + '. ' +
											'Focusing and refreshing count...');
					chrome.tabs.update(tab.id, {selected: true});
					return;
				}
			}
			console.log('Could not find ownCloud extension option tab. Creating one...');
			chrome.tabs.create({ url: getExtOptionPageUrl() });
		});

	} else {
		if (!backgroundStarted) {
			console.log('Background not yet started, starting...');
			startBackground();
		}
		console.log('Going to ownCloud News...');
		chrome.tabs.getAllInWindow(undefined, function(tabs) {
			for (var i = 0, tab; tab = tabs[i]; i++) {
				if (tab.url && isOwnCloudNewsUrl(tab.url)) {
					console.log('Found ownCloud tab: ' + tab.url + '. ' +
											'Focusing and refreshing count...');
					chrome.tabs.update(tab.id, {selected: true});
					startRequest({scheduleRequest:false, showLoadingAnimation:false});
					return;
				}
			}
			console.log('Could not find ownCloud News tab. Creating one...');
			chrome.tabs.create({url: getOwnCloudNewsUrl()});
		});
	}
}

function getExtOptionPageUrl() {
	// Return the option page URL of the extension
	return chrome.runtime.getManifest().options_page;
}

function isExtOptionPageUrl(url) {
	// Return whether the URL is the option page of the extension
	var optUrl = chrome.runtime.id + '/' + getExtOptionPageUrl();
	return (url.indexOf(optUrl) > -1);
}

function onInit() {
	console.log('onInit');
	localStorage.requestFailureCount = 0;  // used for exponential backoff
	startRequest({scheduleRequest:true, showLoadingAnimation:true});
	if (!oldChromeVersion) {
		// TODO(mpcomplete): We should be able to remove this now, but leaving it
		// for a little while just to be sure the refresh alarm is working nicely.
		chrome.alarms.create('watchdog', {periodInMinutes:5});
	}
}

function onAlarm(alarm) {
	console.log('Got alarm', alarm);
	// |alarm| can be undefined because onAlarm also gets called from
	// window.setTimeout on old chrome versions.
	if (alarm && alarm.name == 'watchdog') {
		onWatchdog();
	} else {
		startRequest({scheduleRequest:true, showLoadingAnimation:false});
	}
}

function onWatchdog() {
	chrome.alarms.get('refresh', function(alarm) {
		if (alarm) {
			console.log('Refresh alarm exists. Yay.');
		} else {
			console.log('Refresh alarm doesn\'t exist!? ' +
			 'Refreshing now and rescheduling.');
			startRequest({scheduleRequest:true, showLoadingAnimation:false});
		}
	});
}

function onNavigate(details) {
	if (details.url && isOwnCloudNewsUrl(details.url)) {
		console.log('Recognized ownCloud navigation to ownCloud, Refreshing count...');
		startRequest({scheduleRequest:false, showLoadingAnimation:false});
	}
}

function startBackground() {
	if (oldChromeVersion) {
		updateIcon();
		onInit();
	} else {
		chrome.runtime.onInstalled.addListener(onInit);
		chrome.alarms.onAlarm.addListener(onAlarm);
	}

	var filters = {
		// TODO(aa): Cannot use urlPrefix because all the url fields lack the protocol
		// part. See crbug.com/140238.
		url: [{urlContains: getOwnCloudNewsUrl().replace(/^https?\:\/\//, '')}]
	};

	if (chrome.webNavigation && chrome.webNavigation.onDOMContentLoaded &&
			chrome.webNavigation.onReferenceFragmentUpdated) {
		chrome.webNavigation.onDOMContentLoaded.addListener(onNavigate, filters);
		chrome.webNavigation.onReferenceFragmentUpdated.addListener(
				onNavigate, filters);
	} else {
		chrome.tabs.onUpdated.addListener(function(_, details) {
			onNavigate(details);
		});
	}

	if (chrome.runtime && chrome.runtime.onStartup) {
		chrome.runtime.onStartup.addListener(function() {
			console.log('Starting browser... updating icon.');
			startRequest({scheduleRequest:false, showLoadingAnimation:false});
			updateIcon();
		});
	} else {
		// This hack is needed because Chrome 22 does not persist browserAction icon
		// state, and also doesn't expose onStartup. So the icon always starts out in
		// wrong state. We don't actually use onStartup except as a clue that we're
		// in a version of Chrome that has this problem.
		chrome.windows.onCreated.addListener(function() {
			console.log('Window created... updating icon.');
			startRequest({scheduleRequest:false, showLoadingAnimation:false});
			updateIcon();
		});
	}
}

chrome.browserAction.onClicked.addListener(goToInbox);

if (localStorage.hasOwnProperty('oc_url')) {
	startBackground();
	backgroundStarted = true;
}

