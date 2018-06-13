# tress

Easy to use asynchronous job queue.

[![Build Status][travis-image]][travis-url]
[![NPM version][npm-image]][npm-url]

It stores jobs in the memory and runs it asynchronously in parallel with a given concurrency. Successor of [caolan/async.queue](http://caolan.github.io/async/docs.html#queue).

Basically `tress` is a clone of `queue` from famous [`caolan/async`](https://github.com/caolan/async) but without all other implements of that Swiss Army Knife of asynchronous code. Although `tress` was intended to be an improved, better maintained and more safe alternative to `caolan/async.queue`, but first and foremost `tress` is backward compatible. It means, that everywhere you use `async.queue` (except undocumented features) you can write `tress` instead and it __must__ work.

You can do like this:

```js
// old code:
var async = require('async');
var q = async.queue(function(job, done){/*...*/});
/*...*/

// new code:
var tress = require('tress');
var q = tress(function(job, done){/*...*/});
/*...*/

```

Every code using `caolan/async.queue` __must__ work with `tress`. If it does not work exactly the same way, please [start the issue](https://github.com/astur/tress/issues).

All documentation of `caolan/async.queue` is right for `tress`, but it doesn't describe it completely. Any way, you can use `tress` only with [this](http://caolan.github.io/async/docs.html#queue) documentation (instead of referencs below) and don't even think about any extra features. Only exception - `tress` require `node >=8` and doesn't work in browsers.

Main difference between `tress` and `caolan/async.queue` is that in `tress` job not disappear after worker finished. It moves to `failed` or `finished` (depends of `done` first argument) and can be used later. Second difference is that in `tress` fields of queue object are more safe. They are readable/writable only in correct way. Also `tress` has some new fields in queue object (see in reference).

## Install

```bash
npm install tress
```

## Synopsis

```js
var tress = require('tress');

// create a queue object with worker and concurrency 2
var q = tress(function(job, done){
    console.log('hello ' + job.name);
    someAsyncFunction(job, function(err, data){
        if (err) {
            done(err, 'some message');
        } else {
            done(null, 'anything');
        }
    });
}, 2);

// assign a callbacks
q.drain = function(){
    console.log('Finished');
};

q.error = function(err) {
    console.log('Job ' + this + ' failed with error ' + err);
};

q.success = function(data) {
    console.log('Job ' + this + ' successfully finished. Result is ' + data);
}

// add some items to the queue
q.push({name: 'Bob'});
q.push({name: 'Alice'});

// add some items to the queue (batch-wise)
// and specify callback only for that items (not for all queue)
q.push([{name: 'Good'}, {name: 'Bad'}, {name: 'Ugly'}], function (err) {
    console.log('finished processing item');
});

// add some items to the front of the queue
q.unshift({name: 'Cristobal Jose Junta'});

```

## Reference

`tress(worker, [concurrency])` creates queue object that will store jobs and process them with `worker` function in parallel (up to the `concurrency` limit).

__Arguments:__

* `worker(job, done)` - An asynchronous function for processing a queued data.
  * `job` - data for processing. It may be primitive or object.
  * `done(err, ...args)` - callback function. `worker` must call `done` when finished. `done` may take various argumens, but first argument must be error (if job failed), null/undefined (if job successfully finished) or boolean (if job need to be returned to queue head (if `true`) or to queue tail (if `false`) for retry).
* `concurrency` - An integer for determining how many worker functions should be run in parallel. Defaults to 1. If negative - no parallel and delay between worker calls (concurrency -1000 sets 1 second delay).

__Queue object properties__

* `started` - still `false` till any items have been pushed and processed by the queue. Than became `true` and never change in queue lifecycle (Not writable).
* `concurrency` - This property for alter the concurrency/delay on-the-fly.
* `buffer` A minimum threshold buffer in order to say that the queue is unsaturated. Defaults to `concurrency / 4`.
* `paused` - a boolean for determining whether the queue is in a paused state. Not writable (use `pause()` and `resume()` instead).
* `waiting` (___new___) - array of queued jobs.
* `active` (___new___) - array of jobs currently being processed.
* `failed` (___new___) - array of failed jobs (`done` callback was called from worker with error in first argument).
* `finished` (___new___) - array of correctly finished jobs (`done` callback was called from worker with `null` or `undefined` in first argument).

_Note, that properties `waiting`, `active`, `failed` and `finished` are not writable, but they point to arrays, that you can cahge manually. Do it carefully._

__Queue object methods__

_Note, that in `tress` you can't rewrite methods._

* `push(job, [callback])` or `unshift(job, [callback])` - add a new job to the queue. `push` adds job to queue tail and `unshift` to queue head.
  * `job` - Job to add to queue. Instead of a single job, array of jobs can be submitted.
  * `callback(err, ...args)` - optional callback. `tress` calls this callback once the worker has finished processing the job. With same arguments as in `done` callback.
* `pause()` - a function that pauses the processing of new jobs until `resume()` is called.
* `resume()` - a function that resumes the processing of queued jobs paused by `pause`.
* `kill()` - a function that removes the drain callback and empties queued jobs.
* `remove()` a function that removes job from queue.
* `length()` - a function returning the number of items waiting to be processed.
* `running()` - a function returning the number of items currently being processed.
* `workersList()` - a function returning the array of items currently being processed.
* `idle()` - a function returning false if there are items waiting or being processed, or true if not.
* `save(callback)` (___new___) - a function that runs a callback with object, that contains arrays of `waiting`, `failed`, and `finished` jobs. If there are any `active` jobs at the moment, they will be concatenated to `waiting` array.
* `load(data)`  (___new___) - a function that loads new arrays from `data` object to `waiting`, `failed`, and `finished` arrays and sets `active` to empty array. Rise error if `started` is `true`.
* `status(job)` (___new___) a function returning the status of `job` (`'waiting'`, `'running'`, `'finished'`, `'pending'` or `'missing'`).

__Queue objects callbacks__

_You can assign callback function to this six properties. Note, you can't call any of that calbacks manually._
* `saturated()` - a callback that is called when the number of running workers hits the concurrency limit, and further jobs will be queued.
* `unsaturated()` - a callback that is called when the number of running workers is less than the concurrency & buffer limits, and further jobs will not be queued.
* `empty()` - a callback that is called when the last item from the queue is given to a worker.
* `drain()` - a callback that is called when the last item from the queue has been returned from the worker.
* `error(...args)` (___new___) - a callback that is called when job failed (worker call `done` with error as first argument).
* `success(err, ...args)` (___new___) - a callback that is called when job correctly finished (worker call `done` with `null` or `undefined` as first argument).
* `retry(err, ...args)` (___new___) - a callback that is called when job returned to queue for retry (worker call `done` with boolean as first argument).

__Job lifecycle__

_After pushing/unshifting to queue every job passes through the following steps:_

* processed in worker
* sent to `done` (as `this` or explicitly as one of parameters if you prefere arraw-callbacks)
* moved from `active` to `failed`/`finished`/`waiting` (wether first parameter of `done` is error, null or boolean)
* sent to job callback (from `push`/`unshift`)
* sent to `error`/`success`/`retry` callback (wether first parameter of `done` is error, null or boolean)

## License

MIT

[npm-url]: https://npmjs.org/package/tress
[npm-image]: https://badge.fury.io/js/tress.svg
[travis-url]: https://travis-ci.org/astur/tress
[travis-image]: https://travis-ci.org/astur/tress.svg?branch=master