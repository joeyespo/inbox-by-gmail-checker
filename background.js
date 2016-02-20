// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// Derivative work by Joe Esposito

// Configuration
var animationFrames = 36;
var animationSpeed = 10; // ms
var canvas = document.getElementById('canvas');
var loggedInImage = document.getElementById('logged_in');
var canvasContext = canvas.getContext('2d');
var pollIntervalDefault = 60;  // 1 minute
var pollIntervalMax = 3600;  // 1 hour
var requestTimeout = 1000 * 2;  // 2 seconds
var tryAgainTime = 1000 * 5;  // 5 seconds
var rotation = 0;
var loadingAnimation = new LoadingAnimation();

var options = {
  defaultUser: 0,
  pollInterval: 0,
  quietHours: [],
  useSnoozeColor: true
};

// Legacy support for pre-event-pages
var oldChromeVersion = !chrome.runtime;
var requestTimerId;

function isQuietTime() {
  var time = new Date();
  var currentHour = time.getHours();
  return options.quietHours && options.quietHours.indexOf(currentHour) !== -1;
}

function getUser() {
  // Appends the /u/ route when default user is set and not equal to 0
  return options.defaultUser ? ('u/' + options.defaultUser + '/') : '';
}

function getGmailBaseUrl() {
  return 'https://mail.google.com/';
}

function getGmailUrl() {
  return getGmailBaseUrl() + 'mail/' + getUser();
}

function getInboxBaseUrl() {
  return 'https://inbox.google.com/';
}

function getInboxUrl() {
  return getInboxBaseUrl() + getUser();
}

// Identifier used to debug the possibility of multiple instances of the
// extension making requests on behalf of a single user.
function getInstanceId() {
  if (!localStorage.hasOwnProperty("instanceId"))
    localStorage.instanceId = 'gmc' + parseInt(Date.now() * Math.random(), 10);
  return localStorage.instanceId;
}

function getFeedUrl() {
  // "zx" is a Gmail query parameter that is expected to contain a random
  // string and may be ignored/stripped.
  return getGmailUrl() + "feed/atom?zx=" + encodeURIComponent(getInstanceId());
}

function isInboxUrl(url) {
  // Return whether the URL starts with the Inbox prefix.
  return url.indexOf(getInboxBaseUrl()) === 0 ||
    url.indexOf(getGmailBaseUrl()) === 0;
}

// A "loading" animation displayed while we wait for the first response from
// Gmail. This animates the badge text with a dot that cycles from left to
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

  chrome.browserAction.setBadgeBackgroundColor({color: [0, 56, 206, 255]});
  chrome.browserAction.setBadgeText({text: text});
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
    chrome.browserAction.setIcon({path: "inbox_not_logged_in.png"});
    chrome.browserAction.setBadgeBackgroundColor({color: [190, 190, 190, 230]});
    chrome.browserAction.setBadgeText({text:"?"});
  } else {
    var quiet = isQuietTime();
    var unreadCount = localStorage.unreadCount != '0' ? localStorage.unreadCount : '';
    var icon = quiet && options.useSnoozeColor ? 'inbox_quiet.png' : 'inbox_logged_in.png';
    chrome.browserAction.setIcon({path: icon});
    chrome.browserAction.setBadgeBackgroundColor({color: [0, 56, 206, 255]});
    chrome.browserAction.setBadgeText({
      text: (quiet ? '' : unreadCount)
    });
  }
}

function scheduleRequest() {
  console.log('scheduleRequest');
  var pollInterval = options.pollInterval || pollIntervalDefault;
  var multiplier = Math.pow(2, localStorage.requestFailureCount || 0);
  // Use different logic for smaller poll intervals
  if (pollInterval < 1) {
    pollInterval *= multiplier;
  } else {
    var randomness = Math.random() * 2;
    var fuzzyMultiplier = Math.max(randomness * multiplier, 1);
    pollInterval = Math.round(fuzzyMultiplier * pollInterval);
  }
  var delay = Math.min(pollInterval, pollIntervalMax);
  console.log('Scheduling for: ' + delay + ' seconds');

  if (oldChromeVersion) {
    if (requestTimerId) {
      window.clearTimeout(requestTimerId);
    }
    requestTimerId = window.setTimeout(onAlarm, delay * 1000);
  } else {
    console.log('Creating alarm');
    // Use a repeating alarm so that it fires again if there was a problem
    // setting the next alarm.
    chrome.alarms.create('refresh', {periodInMinutes: delay / 60.0});
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

function getInboxCount(onSuccess, onError, workaroundAttempted) {
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

      // Check for edge case where mail.google.com has not yet been visited and try again
      if (xhr.status === 401) {
        // Visit regular gmail to authorize feed access
        console.log('Got error 401 while getting inbox count... opening', getGmailUrl());
        chrome.tabs.create({ url: getGmailUrl() });
        // Try again
        if (!workaroundAttempted) {
          window.setTimeout(function() {
            getInboxCount(onSuccess, onError, true);
          }, tryAgainTime);
        }
        return;
      }

      if (xhr.responseXML) {
        var xmlDoc = xhr.responseXML;
        var fullCountSet = xmlDoc.evaluate("/gmail:feed/gmail:fullcount",
            xmlDoc, gmailNSResolver, XPathResult.ANY_TYPE, null);
        var fullCountNode = fullCountSet.iterateNext();
        if (fullCountNode) {
          handleSuccess(fullCountNode.textContent);
          return;
        } else {
          console.error(chrome.i18n.getMessage("gmailcheck_node_error"));
        }
      }

      handleError();
    };

    xhr.onerror = function(error) {
      handleError();
    };

    xhr.open("GET", getFeedUrl(), true);
    xhr.send(null);
  } catch(e) {
    console.error(chrome.i18n.getMessage("gmailcheck_exception", e));
    handleError();
  }
}

function gmailNSResolver(prefix) {
  if(prefix == 'gmail') {
    return 'http://purl.org/atom/ns#';
  }
}

function updateUnreadCount(count) {
  var quietTime = isQuietTime();
  var changed = localStorage.unreadCount != count || String(localStorage.quietTime) != String(quietTime);
  localStorage.unreadCount = count;
  localStorage.quietTime = quietTime;
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
  console.log('Going to inbox...');
  chrome.tabs.query({
      url: "*://inbox.google.com/*"
  }, function (tabs) {
    var tab = tabs[0];
    if (tab != undefined) {
      console.log('Found Inbox tab: ' + tab.url + '. ' +
        'Focusing and refreshing count...');
      chrome.tabs.update(tab.id, { selected: true });
      chrome.windows.update(tab.windowId, { "focused": true });
      startRequest({ scheduleRequest: false, showLoadingAnimation: false });
      return;
    }
    console.log('Could not find Inbox tab. Creating one...');
    chrome.tabs.create({ url: getInboxUrl() });
  });
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
  if (details.url && isInboxUrl(details.url)) {
    console.log('Recognized Inbox navigation to: ' + details.url + '.' +
                'Refreshing count...');
    startRequest({scheduleRequest:false, showLoadingAnimation:false});
  }
}

function loadHoursList(s) {
  if (!s) {
    return [];
  }

  var hourStrings = s.split(',');
  var hours = [];
  for (var i = 0; i < hourStrings.length; i++) {
    var hour = parseInt(hourStrings[i]);
    if (!isNaN(hour) && hour >= 0 && hour < 24) {
      hours.push(hour);
    }
  }
  return hours;
}

function loadOptions(callback) {
  if (!chrome || !chrome.storage || !chrome.storage.sync) {
    callback(false);
    return;
  }

  chrome.storage.sync.get({
    defaultUser: 0,
    pollInterval: 0,
    quietHours: '',
    useSnoozeColor: true
  }, function(items) {
    options.defaultUser = items.defaultUser;
    options.pollInterval = parseInt(items.pollInterval) || 0;
    options.quietHours = loadHoursList(items.quietHours);
    options.useSnoozeColor = !!items.useSnoozeColor;
    callback(true);
  });
}

function refresh() {
  startRequest({scheduleRequest: true, showLoadingAnimation: false});
}

function main() {
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
    url: [{urlContains: getInboxBaseUrl().replace(/^https?\:\/\//, '')}]
  };

  if (chrome.webNavigation && chrome.webNavigation.onDOMContentLoaded &&
      chrome.webNavigation.onReferenceFragmentUpdated) {
    chrome.webNavigation.onDOMContentLoaded.addListener(onNavigate, filters);
    chrome.webNavigation.onReferenceFragmentUpdated.addListener(onNavigate, filters);
  } else {
    chrome.tabs.onUpdated.addListener(function(_, details) {
      onNavigate(details);
    });
  }

  chrome.browserAction.onClicked.addListener(goToInbox);

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

  loadOptions(function () {
    refresh();
    chrome.storage.onChanged.addListener(function(changes, namespace) {
      loadOptions(function () {
        refresh();
      });
    });
  });
}

main();
