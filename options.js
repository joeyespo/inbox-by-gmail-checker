function restoreOptions() {
  chrome.storage.sync.get({
    defaultUser: '0',
    quietHours: '',
    pollInterval: '1'
  }, function(items) {
    document.getElementById('defaultUser').value = items.defaultUser;
    document.getElementById('quietHours').value = items.quietHours;
      document.getElementById('pollInterval').value = items.pollInterval || 1;
  });
}

function saveOptions(e) {
  e.preventDefault();

  // Normalize
  var defaultUser = Math.max(0, parseInt(document.getElementById('defaultUser').value) || 0);
  var quietHours = document.getElementById('quietHours').value;
  var pollInterval = Math.max(0, parseFloat(document.getElementById('pollInterval').value) || 1);

  chrome.storage.sync.set({
    defaultUser: defaultUser,
    quietHours: quietHours,
    pollInterval: pollInterval
  }, function() {
    // Update status to let user know options were saved.
    var status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(function() {
      status.textContent = '';
    }, 3000);
  });

  // Show normalized values
  restoreOptions();
  return false;
}

function defaultOptions() {
  document.getElementById('defaultUser').value = 0;
  document.getElementById('quietHours').value = '';
  document.getElementById('pollInterval').value = 1;
}

function main() {
  if (!chrome || !chrome.storage || !chrome.storage.sync) {
    var status = document.getElementById('status');
    status.style.cssText = 'color:red;';
    status.textContent = 'Error: Could not load settings. Please upgrade Chrome.';
    return;
  }
  document.addEventListener('DOMContentLoaded', restoreOptions);
  document.getElementById('defaults').addEventListener('click', defaultOptions);
  document.getElementById('optionsForm').addEventListener('submit', saveOptions);
}

main();
