function Tress(worker, concurrency){ // function worker(job, done)

    if(!(this instanceof Tress)) {return new Tress(worker, concurrency);}

    var _concurrency = concurrency || 1;
    var _paused = false;
    var _queue = {
        waiting: [],
        running: [],
        errors: [],
        finished: []
    };

    var _onDrain = function(){};
    var _onError = function(){};

    var _startJob = function(){
        if(_queue.waiting.length === 0 && _queue.running.length === 0) _onDrain();

        if (_paused || _queue.running.length === _concurrency || _queue.waiting.length === 0) return;

        var job = _queue.waiting.shift();
        _queue.running.push(job);

        worker(job, (err) => {
            _queue.running = _queue.running.filter((v) => v !== job);
            _queue[err ? 'errors' : 'finished'].push(job);
            if (err) _onError(job);
            _startJob();
        });

        _startJob();
    };

    var _addJob = function(job, prior){
        var jobType = Object.prototype.toString.call(job).slice(8,-1);
        switch (jobType){
            case 'Array':
                for (var i = 0; i < job.length; i++) {
                    _addJob(job[i], prior);
                }
                return;
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

    this.push = (job) => _addJob(job);
    this.unshift = (job) => _addJob(job, true);
    this.pause = () => _paused = true;
    this.resume = () => {
        _paused = false;
        _startJob();
    };

    Object.defineProperty(this, 'drain', { set: (f) => {_onDrain = _set(f);}});
    Object.defineProperty(this, 'error', { set: (f) => {_onError = _set(f);}});
    Object.defineProperty(this, 'concurrency', { get: () => _concurrency });
    Object.defineProperty(this, 'paused', { get: () => _paused });
    Object.defineProperty(this, 'queue', { get: () => _queue });

}

module.exports = Tress;

function _set(v){
    if (v === undefined || v === null) return function(){};
    if (typeof v === 'function') return v;
    throw new Error('Type must be function');
}
