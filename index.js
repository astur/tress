const type = require('easytype');
const _noop = () => {};
const _set = (v = _noop) => {
    if(type.isFunction(v)) return v;
    throw new Error('Type must be function');
};

module.exports = (worker, concurrency = 1) => { // function worker(job, done)
    const tress = {};

    if(concurrency === 0) throw new Error('Concurrency can not be 0');
    if(!type.isNumber(concurrency)) throw new Error('Concurrency must be a number');
    if(!type.isFunction(worker)) throw new Error('Worker must be a function');
    let _concurrency = concurrency > 0 ? concurrency : 1;
    let _delay = concurrency < 0 ? -concurrency : 0;
    let _buffer = _concurrency / 4;
    let _paused = false;
    let _started = false;
    let _saturated = false;
    let _queue = {
        waiting: [],
        active: [],
        failed: [],
        finished: [],
    };

    let _onDrain = _noop;
    let _onEmpty = _noop;
    let _onSaturated = _noop;
    let _onUnsaturated = _noop;
    let _onError = _noop;
    let _onSuccess = _noop;
    let _onRetry = _noop;

    const _startJob = delayable => {
        if(_queue.waiting.length === 0 && _queue.active.length === 0) _onDrain();

        if(_paused || _queue.active.length >= _concurrency || _queue.waiting.length === 0) return;

        const job = _queue.waiting.shift();
        _queue.active.push(job);

        if(_queue.waiting.length === 0) _onEmpty();
        if(_queue.active.length === _concurrency && !_saturated){
            _saturated = true;
            _onSaturated();
        }

        let doneCalled = false;

        setTimeout(worker, delayable ? _delay : 0, job.data, (err, ...args) => {
            if(doneCalled){
                throw new Error('Too many callback calls in worker');
            } else {
                doneCalled = true;
            }
            _queue.active = _queue.active.filter(v => v !== job);
            if(typeof err === 'boolean'){
                _queue.waiting[err ? 'unshift' : 'push'](job);
                _onRetry.call(job.data, ...args);
            } else {
                _queue[err ? 'failed' : 'finished'].push(job);
                job.callback.call(job.data, err, ...args);
                if(err) _onError.call(job.data, err, ...args);
                if(!err) _onSuccess.call(job.data, ...args);
            }
            if(_queue.active.length <= _concurrency - _buffer && _saturated){
                _saturated = false;
                _onUnsaturated();
            }
            _startJob(true);
        });

        _startJob();
    };

    const _addJob = (job, callback, prior) => {
        _started = true;
        if(type.isFunction(job) || type.isUndefined(job)) throw new Error(`Unable to add ${type(job)} to queue`);
        if(type.isArray(job)){
            job.forEach(j => _addJob(j, callback, prior));
            return;
        }
        const jobObject = {
            data: job,
            callback: _set(callback),
        };
        _queue.waiting[prior ? 'unshift' : 'push'](jobObject);

        setTimeout(_startJob, 0);
    };

    const _push = (job, callback) => _addJob(job, callback);
    const _unshift = (job, callback) => _addJob(job, callback, true);
    const _length = () => _queue.waiting.length;
    const _running = () => _queue.active.length;
    const _workersList = () => _queue.active;
    const _idle = () => _queue.waiting.length + _queue.active.length === 0;
    const _pause = () => {
        _paused = true;
    };
    const _resume = () => {
        _paused = false;
        _startJob();
    };
    const _kill = () => {
        _onDrain = _noop;
        _queue.waiting = [];
    };
    const _remove = task => {
        _queue.waiting = _queue.waiting.filter(v => v.data === task);
    };
    const _save = callback => callback({
        waiting: _queue.waiting.slice().concat(_queue.active).map(v => v.data),
        failed: _queue.failed.slice().map(v => v.data),
        finished: _queue.finished.slice().map(v => v.data),
    });
    const _load = data => {
        if(_started) throw new Error('Unable to load data after queue started');
        _started = true;
        const mapper = v => ({data: v, callback: _set()});
        _queue = {
            waiting: (data.waiting || []).map(mapper),
            active: [],
            failed: (data.failed || []).map(mapper),
            finished: (data.finished || []).map(mapper),
        };
        if(!_paused) _startJob();
    };
    const _status = job =>
        _queue.waiting.map(v => v.data).includes(job) ? 'waiting' :
            _queue.active.map(v => v.data).includes(job) ? 'active' :
                _queue.finished.map(v => v.data).includes(job) ? 'finished' :
                    _queue.failed.map(v => v.data).includes(job) ? 'failed' :
                        'missing';

    Object.defineProperty(tress, 'drain', {
        set: f => {
            _onDrain = _set(f);
        },
    });
    Object.defineProperty(tress, 'empty', {
        set: f => {
            _onEmpty = _set(f);
        },
    });
    Object.defineProperty(tress, 'saturated', {
        set: f => {
            _onSaturated = _set(f);
        },
    });
    Object.defineProperty(tress, 'unsaturated', {
        set: f => {
            _onUnsaturated = _set(f);
        },
    });
    Object.defineProperty(tress, 'error', {
        set: f => {
            _onError = _set(f);
        },
    });
    Object.defineProperty(tress, 'success', {
        set: f => {
            _onSuccess = _set(f);
        },
    });
    Object.defineProperty(tress, 'retry', {
        set: f => {
            _onRetry = _set(f);
        },
    });
    Object.defineProperty(tress, 'concurrency', {
        get: () => _delay > 0 ? -_delay : _concurrency,
        set: v => {
            if(v === 0) throw new Error('Concurrency can not be 0');
            if(!type.isNumber(v)) throw new Error('Concurrency must be a number');
            _concurrency = v > 0 ? v : 1;
            _delay = v < 0 ? -v : 0;
        },
    });
    Object.defineProperty(tress, 'paused', {get: () => _paused});
    Object.defineProperty(tress, 'started', {get: () => _started});
    Object.defineProperty(tress, 'waiting', {get: () => _queue.waiting});
    Object.defineProperty(tress, 'active', {get: () => _queue.active});
    Object.defineProperty(tress, 'failed', {get: () => _queue.failed});
    Object.defineProperty(tress, 'finished', {get: () => _queue.finished});

    Object.defineProperty(tress, 'push', {get: () => _push});
    Object.defineProperty(tress, 'unshift', {get: () => _unshift});
    Object.defineProperty(tress, 'length', {get: () => _length});
    Object.defineProperty(tress, 'running', {get: () => _running});
    Object.defineProperty(tress, 'workersList', {get: () => _workersList});
    Object.defineProperty(tress, 'idle', {get: () => _idle});
    Object.defineProperty(tress, 'buffer', {
        get: () => _buffer,
        set: v => {
            if(!type.isNumber(v)) throw new Error('Buffer must be a number');
            _buffer = v;
        },
    });
    Object.defineProperty(tress, 'pause', {get: () => _pause});
    Object.defineProperty(tress, 'resume', {get: () => _resume});
    Object.defineProperty(tress, 'kill', {get: () => _kill});
    Object.defineProperty(tress, 'remove', {get: () => _remove});
    Object.defineProperty(tress, 'save', {get: () => _save});
    Object.defineProperty(tress, 'load', {get: () => _load});
    Object.defineProperty(tress, 'status', {get: () => _status});

    return tress;
};
