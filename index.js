function Tress(worker, concurrency){ // function worker(job, done)

    if(!(this instanceof Tress)) {return new Tress(worker, concurrency);}

    if(concurrency === 0) throw new Error('Concurrency can not be 0');
    var _concurrency = concurrency > 0 ? concurrency : 1;
    var _delay = concurrency < 0 ? -concurrency : 0;
    var _buffer = _concurrency / 4;
    var _paused = false;
    var _started = false;
    var _queue = {
        waiting: [],
        active: [],
        failed: [],
        finished: []
    };

    var _onDrain = function(){};
    var _onEmpty = function(){};
    var _onSaturated = function(){};
    var _onUnsaturated = function(){};
    var _onError = function(){};
    var _onSuccess = function(){};
    var _onRetry = function(){};

    var _startJob = function(delayable){
        if(_queue.waiting.length === 0 && _queue.active.length === 0) _onDrain();

        if (_paused || _queue.active.length >= _concurrency || _queue.waiting.length === 0) return;

        var job = _queue.waiting.shift();
        if(_queue.waiting.length === 0) _onEmpty();

        _queue.active.push(job);
        if(_queue.active.length === _concurrency) _onSaturated();

        var doneCalled = false;

        setTimeout(worker, delayable ? _delay : 0, job.data, function(err){
            if(doneCalled){
                throw new Error('Too many callback calls in worker');
            } else {
                doneCalled = true;
            }
            _queue.active = _queue.active.filter((v) => v !== job);
            if (_queue.active.length <= _concurrency - this.buffer) _onUnsaturated();
            if (typeof err === 'boolean'){
                _queue.waiting[err ? 'unshift' : 'push'](job);
                _onRetry.apply(job.data, Array.prototype.slice.call(arguments, 1));
            } else {
                _queue[err ? 'failed' : 'finished'].push(job);
                job.callback && job.callback.apply(job.data, arguments);
                err && _onError.apply(job.data, [err, job.data].concat(Array.prototype.slice.call(arguments, 1)));
                !err && _onSuccess.apply(job.data, Array.prototype.slice.call(arguments, 1));
            }
            _startJob(true);
        });

        _startJob();
    };

    var _addJob = function(job, callback, prior){
        _started = true;
        callback = _set(callback);
        var jobType = Object.prototype.toString.call(job).slice(8,-1);
        switch (jobType){
            case 'Array':
                for (var i = 0; i < job.length; i++) {
                    _addJob(job[i], callback, prior);
                }
                return;
            case 'Function':
            case 'Undefined':
                throw new Error('Unable to add ' + jobType + ' to queue');
        }
        var jobObject = {
            data: job,
            callback: callback
        }
        if (prior) {
            _queue.waiting.unshift(jobObject);
        } else {
            _queue.waiting.push(jobObject);
        }

        setTimeout(_startJob, 0);
    };

    var _push = (job, callback) => _addJob(job, callback);
    var _unshift = (job, callback) => _addJob(job, callback, true);
    var _length = () => _queue.waiting.length;
    var _running = () => _queue.active.length;
    var _workersList = () => _queue.active;
    var _idle = () => _queue.waiting.length + _queue.active.length === 0;
    var _pause = () => _paused = true;
    var _resume = () => {
        _paused = false;
        _startJob();
    };
    var _kill = () => {
        _onDrain = function(){};
        _queue.waiting = [];
    };
    var _save = (callback) => callback({
        waiting: _queue.waiting.slice().concat(_queue.active).map((v) => v.data),
        failed: _queue.failed.slice().map((v) => v.data),
        finished: _queue.finished.slice().map((v) => v.data)
    });
    var _load = (data) => {
        if (_started) throw new Error('Unable to load data after queue started');
        var mapper = (v) => {return {data: v, callback: _set()}};
        _queue = {
            waiting: data.waiting.map(mapper),
            active: [],
            failed: data.failed.map(mapper),
            finished: data.finished.map(mapper)
        };
        !_paused && _startJob();
    };
    var _status = (job) => {
        _queue.waiting.indexOf(job) >= 0 ? 'waiting' :
        _queue.active.indexOf(job) >= 0 ? 'active' :
        _queue.finished.indexOf(job) >= 0 ? 'finished' :
        _queue.failed.indexOf(job) >= 0 ? 'failed' :
        'missing'
    };

    Object.defineProperty(this, 'drain', { set: (f) => {_onDrain = _set(f);}});
    Object.defineProperty(this, 'empty', { set: (f) => {_onEmpty = _set(f);}});
    Object.defineProperty(this, 'saturated', { set: (f) => {_onSaturated = _set(f);}});
    Object.defineProperty(this, 'unsaturated', { set: (f) => {_onUnsaturated = _set(f);}});
    Object.defineProperty(this, 'error', { set: (f) => {_onError = _set(f);}});
    Object.defineProperty(this, 'success', { set: (f) => {_onSuccess = _set(f);}});
    Object.defineProperty(this, 'retry', { set: (f) => {_onRetry = _set(f);}});
    Object.defineProperty(this, 'concurrency', {
        get: () => (_delay > 0 ? -_delay : _concurrency),
        set: (v) => {
            _concurrency = v > 0 ? v : 1;
            _delay = v < 0 ? -v : 0;
        }
    });
    Object.defineProperty(this, 'paused', { get: () => _paused });
    Object.defineProperty(this, 'started', { get: () => _started });
    Object.defineProperty(this, 'waiting', { get: () => _queue.waiting });
    Object.defineProperty(this, 'active', { get: () => _queue.active });
    Object.defineProperty(this, 'failed', { get: () => _queue.failed });
    Object.defineProperty(this, 'finished', { get: () => _queue.finished });

    Object.defineProperty(this, 'push', { get: () => _push });
    Object.defineProperty(this, 'unshift', { get: () => _unshift });
    Object.defineProperty(this, 'length', { get: () => _length });
    Object.defineProperty(this, 'running', { get: () => _running });
    Object.defineProperty(this, 'workersList', { get: () => _workersList });
    Object.defineProperty(this, 'idle', { get: () => _idle });
    Object.defineProperty(this, 'buffer', { get: () => _buffer, set: (v) => {
        if(typeof v === 'number') {_buffer = v;} else {throw new Error('Buffer must be a number');}
    }});
    Object.defineProperty(this, 'pause', { get: () => _pause });
    Object.defineProperty(this, 'resume', { get: () => _resume });
    Object.defineProperty(this, 'kill', { get: () => _kill });
    Object.defineProperty(this, 'save', { get: () => _save });
    Object.defineProperty(this, 'load', { get: () => _load });
    Object.defineProperty(this, 'status', { get: () => _status });

}

module.exports = Tress;

function _set(v){
    if (v === undefined || v === null) return function(){};
    if (typeof v === 'function') return v;
    throw new Error('Type must be function');
}
