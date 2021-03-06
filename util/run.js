'use strict';
var os    = require('os');
var cp  = require('child_process');
var path  = require('path');
var Promise = require('bluebird');
var utilSwitches = require('./switches');

var errRE = new RegExp('Error:' + os.EOL + '?(.*)', 'g');

function feedStdout(progress, output, stdin, cancel) {
  if (progress !== undefined) {
    progress(output, undefined, stdin, cancel);
  }
  var res = errRE.exec(output);
  if (res) {
    return res[1];
  } else {
    return undefined;
  }
}

function feedStderr(output) {
  if (output) {
    return output;
  } else {
    return undefined;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error('Assertion failed: ' + message);
  }
}

/**
 * @promise Run
 * @param {string} cmd The command to run.
 * @param {Array} args The parameters to pass.
 * @param {Array} switches Options for 7-Zip as an array.
 * @param {Function} progress function receiving the output. Also receives stdin for the remote process
 *                            as a second parameter, in case a password has to be entered in response.
 * @reject {Error} The error issued by 7-Zip.
 * @reject {number} Exit code issued by 7-Zip.
 */
module.exports = function(cmd, args, switches, progress) {
  try {
    assert(typeof(cmd) === 'string', 'Command must be a string');
    assert(Array.isArray(args), 'args should be an array');
  } catch (err) {
    return Promise.reject(err);
  }

  return new Promise(function (resolve, reject) {
    // Add switches to the `args` array.
    args = args.concat(utilSwitches(switches));
    var canceled = false;

    // When an stdout is emitted, parse it. If an error is detected in the body
    // of the stdout create an new error with the 7-Zip error message as the
    // error's message. Otherwise progress with stdout message.
    var errors = [];
    var run = cp.spawn(cmd, args);
    run.stdout.on('data', function (data) {
      try {
        var errout = feedStdout(progress, data.toString(), run.stdin, function () {
          canceled = true;
          run.kill();
        });
        if (errout) {
          errors.push(errout);
        }
      } catch (err) {
        run.kill();
        reject(err);
      }
    });
    run.stderr.on('data', function (data) {
      try {
        var errout = feedStderr(data.toString());
        if (errout) {
          errors.push(errout);
        }
      } catch (err) {
        run.kill();
        reject(err);
      }
    });
    run.on('error', function (err) {
      run.kill();
      reject(err)
    });
    run.on('close', function (code) {
      return resolve({ code: code, errors: errors });
    });

  });
};
