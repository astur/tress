const test = require('ava');
const tress = require('.');

test.cb('task well done cycle', t => {
    const log = [];
    const q = tress((job, done) => {
        t.is(q.active.length, 1);
        t.is(q.waiting.length, 0);
        t.is(q.finished.length, 0);
        log.push('worker');
        done(null, 'result', job);
    });
    q.success = (...args) => {
        t.deepEqual(args, ['result', 'ok']);
        log.push('success');
    };
    q.drain = () => {
        t.deepEqual(log, ['worker', 'job callback', 'success']);
        t.end();
    };
    q.push('ok', (e, ...args) => {
        if(e){
            t.fail();
        }
        t.deepEqual(args, ['result', 'ok']);
        t.is(q.active.length, 0);
        t.is(q.waiting.length, 0);
        t.is(q.finished.length, 1);
        log.push('job callback');
    });
});

test.cb('task fail cycle', t => {
    const log = [];
    const q = tress((job, done) => {
        t.is(q.active.length, 1);
        t.is(q.waiting.length, 0);
        t.is(q.failed.length, 0);
        log.push('worker');
        done(new Error('fail'), 'result', job);
    });
    q.error = (e, ...args) => {
        if(e){
            t.is(e.message, 'fail');
        }
        t.deepEqual(args, ['result', 'foo']);
        log.push('error');
    };
    q.drain = () => {
        t.deepEqual(log, ['worker', 'job callback', 'error']);
        t.end();
    };
    q.push('foo', (e, ...args) => {
        if(e){
            t.is(e.message, 'fail');
        }
        t.deepEqual(args, ['result', 'foo']);
        t.is(q.active.length, 0);
        t.is(q.waiting.length, 0);
        t.is(q.failed.length, 1);
        log.push('job callback');
    });
});

test.cb('task retry cycle', t => {
    const log = [];
    const flags = [0, 0];
    const cb = job => {
        if(!flags[+job]) t.fail();
    };
    const q = tress((job, done) => {
        log.push(`worker = ${job}`);
        if(typeof job !== 'boolean' || flags[+job] === 1) return done(null, job);
        flags[+job] = 1;
        done(job, job);
    });
    q.retry = job => {
        log.push(`retry = ${job}`);
    };
    q.drain = () => {
        t.deepEqual(log, [
            'worker = false',
            'retry = false',
            'worker = true',
            'retry = true',
            'worker = true',
            'worker = null',
            'worker = false',
        ]);
        t.end();
    };
    q.push([false, true], cb);
    q.push(null);
});
