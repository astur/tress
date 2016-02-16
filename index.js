function Tress(worker, concurrency){ // function worker(job, done)

    if(!(this instanceof Tress)) {return new Tress(worker, concurrency);}

    var _concurrency = concurrency || 1;
    var _started = false;
    var _paused = false;
    var _queue = {
        waiting: [],
        running: [],
        finished: []
    };
    var _results = [];

    var _jobDone = function(job){
        return function(result){
            _results.push(result);
            _queue.finished.push(job);
            var i = _queue.running.indexOf(job);
            if (i > -1) {
                _queue.running.splice(i, 1);
            }
            _startJob();
        }
    }

    var _startJob = function(){
        if (_paused || _queue.running.length === _concurrency || _queue.waiting.length === 0) return;
        var job = _queue.waiting.shift();
        _queue.running.push(job);
        worker(job, _jobDone(job));
        _startJob();
    }

    var _addJob = function(job, prior){
        _started = true;
        if (prior) {
            _queue.waiting.unshift(job);
        } else {
            _queue.waiting.push(job);
        }
        _startJob();
    }

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

    Object.defineProperty(this, 'concurrency', { get: () => _concurrency });
    Object.defineProperty(this, 'started', { get: () => _started });
    Object.defineProperty(this, 'paused', { get: () => _paused });
}

module.exports = Tress;
