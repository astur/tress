const type = require('easytype');
const hardProp = require('hard-prop');
const noop = () => undefined;
const safeSet = (v = noop) => {
    if(type.isFunction(v)) return v;
    throw new TypeError('Function expected');
};

module.exports = (worker, _concurrency = 1) => { // function worker(job, done)
    if(_concurrency === 0) throw new RangeError('Concurrency can not be 0');
    if(!type.isNumber(_concurrency)) throw new TypeError('Concurrency must be a number');
    if(!type.isFunction(worker)) throw new TypeError('Worker must be a function');

    let delay = _concurrency < 0 ? -_concurrency : 0;
    let concurrency = _concurrency > 0 ? _concurrency : 1;
    let buffer = concurrency / 4;
    let paused = false;
    let started = false;
    let saturated = false;
    let queue = {
        waiting: [],
        active: [],
        failed: [],
        finished: [],
    };

    let onDrain = noop;
    let onEmpty = noop;
    let onSaturated = noop;
    let onUnsaturated = noop;
    let onError = noop;
    let onSuccess = noop;
    let onRetry = noop;

    const startJob = delayable => {
        if(queue.waiting.length === 0 && queue.active.length === 0) onDrain();

        if(paused || queue.active.length >= concurrency || queue.waiting.length === 0) return;

        const job = queue.waiting.shift();
        queue.active.push(job);

        if(queue.waiting.length === 0) onEmpty();
        if(queue.active.length === concurrency && !saturated){
            saturated = true;
            onSaturated();
        }

        let doneCalled = false;

        setTimeout(worker, delayable ? delay : 0, job.data, (err, ...args) => {
            if(doneCalled){
                throw new Error('Too many callback calls in worker');
            } else {
                doneCalled = true;
            }
            queue.active = queue.active.filter(v => v !== job);
            if(typeof err === 'boolean'){
                queue.waiting[err ? 'unshift' : 'push'](job);
                onRetry.call(job.data, ...args);
            } else {
                queue[err ? 'failed' : 'finished'].push(job);
                job.callback.call(job.data, err, ...args);
                if(err) onError.call(job.data, err, ...args);
                if(!err) onSuccess.call(job.data, ...args);
            }
            if(queue.active.length <= concurrency - buffer && saturated){
                saturated = false;
                onUnsaturated();
            }
            startJob(true);
        });

        startJob();
    };

    const addJob = (job, callback, prior) => {
        started = true;
        if(type.isFunction(job) || type.isUndefined(job)) throw new TypeError(`Unable to add ${type(job)} to queue`);
        if(type.isArray(job)){
            job.forEach(j => addJob(j, callback, prior));
            return;
        }
        const jobObject = {
            data: job,
            callback: safeSet(callback),
        };
        queue.waiting[prior ? 'unshift' : 'push'](jobObject);

        setTimeout(startJob, 0);
    };

    const push = (job, callback) => addJob(job, callback);
    const unshift = (job, callback) => addJob(job, callback, true);
    const length = () => queue.waiting.length;
    const running = () => queue.active.length;
    const workersList = () => queue.active;
    const idle = () => queue.waiting.length + queue.active.length === 0;
    const pause = () => {
        paused = true;
    };
    const resume = () => {
        paused = false;
        startJob();
    };
    const kill = () => {
        onDrain = noop;
        queue.waiting = [];
    };
    const remove = task => {
        queue.waiting = queue.waiting.filter(v => v.data === task);
    };
    const save = callback => callback({
        waiting: queue.waiting.slice().concat(queue.active).map(v => v.data),
        failed: queue.failed.slice().map(v => v.data),
        finished: queue.finished.slice().map(v => v.data),
    });
    const load = data => {
        if(started) throw new Error('Unable to load data after queue started');
        started = true;
        const mapper = v => ({data: v, callback: safeSet()});
        queue = {
            waiting: (data.waiting || []).map(mapper),
            active: [],
            failed: (data.failed || []).map(mapper),
            finished: (data.finished || []).map(mapper),
        };
        if(!paused) startJob();
    };
    const status = job => queue.waiting.map(v => v.data).includes(job) ? 'waiting' :
        queue.active.map(v => v.data).includes(job) ? 'active' :
            queue.finished.map(v => v.data).includes(job) ? 'finished' :
                queue.failed.map(v => v.data).includes(job) ? 'failed' :
                    'missing';

    // queue object:
    const tress = {};
    const hp = hardProp(tress);

    // callbacks:
    hp('drain', f => {
        onDrain = safeSet(f);
    });
    hp('empty', f => {
        onEmpty = safeSet(f);
    });
    hp('saturated', f => {
        onSaturated = safeSet(f);
    });
    hp('unsaturated', f => {
        onUnsaturated = safeSet(f);
    });
    hp('error', f => {
        onError = safeSet(f);
    });
    hp('success', f => {
        onSuccess = safeSet(f);
    });
    hp('retry', f => {
        onRetry = safeSet(f);
    });

    // properties:
    hp('concurrency', () => delay > 0 ? -delay : concurrency, v => {
        if(v === 0) throw new RangeError('Concurrency can not be 0');
        if(!type.isNumber(v)) throw new TypeError('Concurrency must be a number');
        concurrency = v > 0 ? v : 1;
        delay = v < 0 ? -v : 0;
    });
    hp('buffer', () => buffer, v => {
        if(!type.isNumber(v)) throw new TypeError('Buffer must be a number');
        buffer = v;
    });
    hp('paused', () => paused);
    hp('started', () => started);
    hp('waiting', () => queue.waiting);
    hp('active', () => queue.active);
    hp('failed', () => queue.failed);
    hp('finished', () => queue.finished);

    // methods:
    hp('push', () => push);
    hp('unshift', () => unshift);
    hp('length', () => length);
    hp('running', () => running);
    hp('workersList', () => workersList);
    hp('idle', () => idle);
    hp('pause', () => pause);
    hp('resume', () => resume);
    hp('kill', () => kill);
    hp('remove', () => remove);
    hp('save', () => save);
    hp('load', () => load);
    hp('status', () => status);

    return tress;
};
