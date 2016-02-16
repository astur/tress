function Tress(worker, concurrency){ // function worker(job, done)

    if(!(this instanceof Tress)) {return new Tress(worker, concurrency);}

    var _concurrency = concurrency || 1;
    var _started = false;
    var _paused = false;
    var _queue = {
        waiting: [],
        running: [],
        errors: [],
        finished: []
    };
    var _results = [];

    var _onEmpty = _dummy;
    var _onDrain = _dummy;
    var _onSaturated = _dummy;

    var _jobDone = function(job){
        return function(err, result){
            var i = _queue.running.indexOf(job);
            if (i > -1) _queue.running.splice(i, 1);

            if (err) {
                _queue.errors.push(job);
                _onError(job);
            } else {
                _results.push(result);
                _queue.finished.push(job);
            }
            _startJob();
        };
    };

    var _startJob = function(){
        if(_queue.waiting.length === 0 && _queue.running.length === 0) _onDrain(_results);

        if (_paused || _queue.running.length === _concurrency || _queue.waiting.length === 0) return;

        var job = _queue.waiting.shift();
        if(_queue.waiting.length === 0) _onEmpty();

        _queue.running.push(job);
        if(_queue.running.length === _concurrency) _onSaturated();

        worker(job, _jobDone(job));
        _startJob();
    };

    var _addJob = function(job, prior){
        _started = true;

        var jobType = Object.prototype.toString.call(job).slice(8,-1);
        switch (jobType){
            case 'Array':
                for (var i = 0; i < job.length; i++) {
                    _addJob(job[i], prior);
                }
                return;
            case 'Object':
            case 'Function':
            case 'Undefined':
                throw new Error('Unable to add ' + jobType + ' to queue');
        }

        if (prior) {
            _queue.waiting.unshift(job);
        } else {
            _queue.waiting.push(job);
        }

        _startJob();
    };

    this.push = function(job){
        _addJob(job);
    };

    this.unshift = function(job){
        _addJob(job, true);
    };

    this.pause = function(){
        _paused = true;
    };

    this.resume = function(){
        _paused = false;
        _startJob();
    };

    Object.defineProperty(this, 'empty', { set: (f) => {_onEmpty = _set(f);}}); // no waiting jobs
    Object.defineProperty(this, 'drain', { set: (f) => {_onDrain = _set(f);}}); // no waiting or running jobs
    Object.defineProperty(this, 'saturated', { set: (f) => {_onSaturated = _set(f);}}); //no more free workers
    Object.defineProperty(this, 'error', { set: (f) => {_onError = _set(f);}}); //no more free workers

    Object.defineProperty(this, 'concurrency', { get: () => _concurrency });
    Object.defineProperty(this, 'started', { get: () => _started });
    Object.defineProperty(this, 'paused', { get: () => _paused });
    Object.defineProperty(this, 'idle', { get: () => _queue.waiting.length === 0 });
    Object.defineProperty(this, 'length', { get: () => _queue.waiting.length });
    Object.defineProperty(this, 'running', { get: () => _queue.waiting.length + _queue.running.length });
    Object.defineProperty(this, 'workersList', { get: () => _queue.running });

    Object.defineProperty(this, 'queue', { get: () => _queue });

}

module.exports = Tress;

function _set(v){
    if (v === undefined || v === null) {
        return _dummy;
    }
    if (typeof v === 'function') {
        return v;
    }
    throw new Error('Type must be function');
}

function _dummy(){}
