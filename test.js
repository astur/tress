/* eslint consistent-return: off */
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

test.cb('push run order', t => {
    const log = [];
    const q = tress((job, done) => {
        log.push(job);
        done(null);
    });
    q.drain = () => {
        t.deepEqual(log, [1, 2, 3, 4]);
        t.end();
    };
    q.push([1, 2, 3, 4]);
});

test.cb('unshift run order', t => {
    const log = [];
    const q = tress((job, done) => {
        log.push(job);
        done(null);
    });
    q.drain = () => {
        t.deepEqual(log, [4, 3, 2, 1]);
        t.end();
    };
    q.unshift([1, 2, 3, 4]);
});

test.cb('concurrency run order', t => {
    const starts = [];
    const finishes = [];
    const q = tress((job, done) => {
        starts.push(job);
        t.is(q.concurrency, 2);
        setTimeout(() => done(null, job), job);
    }, 2);
    q.drain = () => {
        t.deepEqual(starts, [30, 20, 70, 10]);
        t.deepEqual(finishes, [20, 30, 10, 70]);
        t.end();
    };
    q.push([30, 20, 70, 10], (e, job) => {
        finishes.push(job);
    });
});

test.cb('changing concurrency', t => {
    const start = Date.now();
    const q = tress((job, done) => {
        setTimeout(() => done(null), 10);
    });
    q.drain = () => {
        t.true(Date.now() - start < 200);
        t.end();
    };
    q.push('*'.repeat(50).split(''));
    t.throws(() => {
        q.concurrency = 'not number';
    });
    t.throws(() => {
        q.concurrency = 0;
    });
    q.concurrency = -10;
    t.is(q.concurrency, -10);
    q.concurrency = 10;
    t.is(q.concurrency, 10);
});

test.cb('delay', t => {
    const start = Date.now();
    const q = tress((job, done) => {
        t.is(q.concurrency, -10);
        done(null);
    }, -10);
    q.drain = () => {
        t.true(Date.now() - start > 50);
        t.end();
    };
    q.push([1, 2, 3, 4, 5]);
});

test('zero concurrency error', t => {
    t.throws(() => tress((job, done) => done(null), 0));
    t.throws(() => tress((job, done) => done(null), 'not number'));
});

test('bad callback errors', t => {
    t.throws(() => tress('non-function'));
    const q = tress((job, done) => done(null));
    t.throws(() => q.push(1, 1));
    t.throws(() => q.push());
    t.throws(() => q.push(() => undefined));
    t.throws(() => q.unshift(1, 1));
    t.throws(() => q.unshift());
    t.throws(() => q.unshift(() => undefined));
    t.throws(() => {
        q.drain = 1;
    });
    t.throws(() => {
        q.empty = 1;
    });
    t.throws(() => {
        q.saturated = 1;
    });
    t.throws(() => {
        q.unsaturated = 1;
    });
    t.throws(() => {
        q.error = 1;
    });
    t.throws(() => {
        q.success = 1;
    });
    t.throws(() => {
        q.retry = 1;
    });
});

test.cb('double callback error', t => {
    const q = tress((job, done) => {
        done(null); // eslint-disable-line callback-return
        t.throws(() => done(null));
        t.end();
    });
    q.push(true);
});

test.cb('status', t => {
    const q = tress((job, done) => {
        t.is(q.status(job), 'active');
        done(job === 'good' ? null : new Error());
    });
    q.drain = () => {
        t.is(q.status('good'), 'finished');
        t.is(q.status('bad'), 'failed');
        t.end();
    };
    q.pause();
    t.false(q.started);
    q.push(['good', 'bad']);
    t.true(q.started);
    t.is(q.status('good'), 'waiting');
    t.is(q.status('bad'), 'waiting');
    t.true(q.paused);
    q.resume();
    t.false(q.paused);
    t.is(q.status('ugly'), 'missing');
});

test.cb('length/running/workersList/idle', t => {
    const q = tress((job, done) => {
        setTimeout(() => done(null), 10);
    }, 2);
    q.drain = () => {
        t.end();
    };
    t.true(q.idle());
    t.is(q.length(), 0);
    t.is(q.running(), 0);
    t.deepEqual(q.workersList(), []);
    q.push(['foo', 'bar', 'baz']);
    setTimeout(() => {
        t.false(q.idle());
        t.is(q.length(), 1);
        t.is(q.running(), 2);
        t.deepEqual(q.workersList().map(v => v.data), ['foo', 'bar']);
    }, 0);
});

test.cb('kill', t => {
    const q = tress((job, done) => {
        setTimeout(() => done(null), 20);
    });
    q.drain = () => {
        t.fail();
    };
    q.push('');
    q.push('', () => t.fail());
    q.kill();
    setTimeout(() => t.end(), 40);
});

test.cb('pause in worker with concurrency', t => {
    const log = [];
    const q = tress((job, done) => {
        if(job === 1){
            q.pause();
            setTimeout(() => {
                q.resume();
                log.push(job);
                done(null);
            }, 30);
        } else {
            setTimeout(() => {
                log.push(job);
                done(null);
            }, 10);
        }
    }, 2);
    q.drain = () => {
        t.deepEqual(log, [2, 1, 3]);
        t.end();
    };
    q.push([1, 2, 3]);
});

test.cb('empty', t => {
    const q = tress((job, done) => {
        setTimeout(() => done(null), 10);
    });
    q.empty = () => {
        t.is(q.active.length, 1);
        t.is(q.waiting.length, 0);
        t.is(q.finished.length, 0);
        t.end();
    };
    q.push('');
});

test.cb('saturation and buffer', t => {
    const q = tress((job, done) => {
        setTimeout(() => done(null), 20);
    }, 4);
    t.throws(() => {
        q.buffer = 'not number';
    });
    t.is(q.buffer, 1);
    q.buffer = 2;
    t.is(q.buffer, 2);
    q.saturated = () => {
        t.is(q.active.length, 4);
        t.is(q.waiting.length, 6);
        t.is(q.finished.length, 0);
    };
    q.unsaturated = () => {
        t.is(q.active.length, 2);
        t.is(q.waiting.length, 0);
        t.is(q.finished.length, 8);
    };
    q.drain = () => {
        t.end();
    };
    q.push('*'.repeat(10).split(''));
});

test.cb('load', t => {
    const q = tress((job, done) => done(null));
    q.load({waiting: [1, 2, 3]});
    t.throws(() => {
        q.load({waiting: [4]});
    });
    const qq = tress((job, done) => done(null));
    qq.pause();
    qq.load({failed: [1], finished: [2]});
    t.true(qq.paused);
    qq.resume();
    setTimeout(() => t.end(), 20);
});

test.cb('save', t => {
    const q = tress((job, done) => {
        if(job === 'foo'){
            return done(new Error());
        } else if(job === 'bar'){
            done(null); // eslint-disable-line callback-return
            q.save(dump => {
                t.deepEqual(dump, {
                    waiting: ['baz'],
                    finished: ['bar'],
                    failed: ['foo'],
                });
                t.end();
            });
        } else {
            return done(null);
        }
    });
    q.push(['foo', 'bar', 'baz']);
});

test.cb('remove', t => {
    const q = tress((job, done) => done(null));
    q.drain = () => {
        t.end();
    };
    q.pause();
    q.push(['foo', 'bar', 'baz']);
    q.remove('bar');
    q.resume();
});
