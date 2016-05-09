function Tress(worker, concurrency){ // function worker(job, done)

    if(!(this instanceof Tress)) {return new Tress(worker, concurrency);}

    var _concurrency = concurrency || 1;
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

    var _startJob = function(){
        if(_queue.waiting.length === 0 && _queue.active.length === 0) _onDrain();

        if (_paused || _queue.active.length === _concurrency || _queue.waiting.length === 0) return;

        var job = _queue.waiting.shift();
        if(_queue.waiting.length === 0) _onEmpty();

        _queue.active.push(job);
        if(_queue.active.length === _concurrency) _onSaturated();

        worker(job.data, function(err){
            _queue.active = _queue.active.filter((v) => v !== job);
            _queue[err ? 'failed' : 'finished'].push(job);
            if (_queue.active.length <= _concurrency - this.buffer) _onUnsaturated();
            job.callback && job.callback.apply(job.data, arguments);
            err && _onError.apply(job.data, arguments);
            !err && _onSuccess.apply(job.data, Array.prototype.slice.call(arguments, 1));
            _startJob();
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

        _startJob();
    };

    _push = (job, callback) => _addJob(job, callback);
    _unshift = (job, callback) => _addJob(job, callback, true);
    _length = () => _queue.waiting.length;
    _running = () => _queue.active.length;
    _workersList = () => _queue.active;
    _idle = () => _queue.waiting.length + _queue.active.length === 0;
    _buffer = _concurrency / 4;
    _pause = () => _paused = true;
    _resume = () => {
        _paused = false;
        _startJob();
    };
    _kill = () => {
        _onDrain = function(){};
        _queue.waiting = [];
    };
    _save = (callback) => callback({
        waiting: _queue.waiting.slice().concat(_queue.active),
        failed: _queue.failed.slice(),
        finished: _queue.finished.slice()
    });
    _load = (data) => {
        if (_started) throw new Error('Unable to load data after queue started');
        _queue = {
            waiting: data.waiting,
            active: [],
            failed: data.failed,
            finished: data.finished
        };
        !_paused && _startJob();
    };
    _status = (job) => {
            _queue.waiting.indexOf(job) >= 0 ? 'waiting' :
            _queue.running.indexOf(job) >= 0 ? 'running' :
            _queue.finished.indexOf(job) >= 0 ? 'finished' :
            _queue.pending.indexOf(job) >= 0 ? 'pending' :
            'missing'
    };

    Object.defineProperty(this, 'drain', { set: (f) => {_onDrain = _set(f);}});
    Object.defineProperty(this, 'empty', { set: (f) => {_onEmpty = _set(f);}});
    Object.defineProperty(this, 'saturated', { set: (f) => {_onSaturated = _set(f);}});
    Object.defineProperty(this, 'unsaturated', { set: (f) => {_onUnsaturated = _set(f);}});
    Object.defineProperty(this, 'error', { set: (f) => {_onError = _set(f);}});
    Object.defineProperty(this, 'success', { set: (f) => {_onSuccess = _set(f);}});
    Object.defineProperty(this, 'concurrency', { get: () => _concurrency });
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
