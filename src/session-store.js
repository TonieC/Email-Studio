'use strict';

const session = require('express-session');
const db = require('./db');
const config = require('./config');

class SQLiteSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.ttl = options.ttl || config.sessionTtlMs;
    this.getStmt = db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expired > ?');
    this.setStmt = db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expired) VALUES (?, ?, ?)');
    this.destroyStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStmt = db.prepare('UPDATE sessions SET expired = ? WHERE sid = ?');
  }

  get(sid, cb) {
    try {
      const row = this.getStmt.get(sid, Date.now());
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      const expires = sess && sess.cookie && sess.cookie.expires
        ? Date.parse(sess.cookie.expires)
        : Date.now() + this.ttl;
      this.setStmt.run(sid, JSON.stringify(sess), Number.isNaN(expires) ? Date.now() + this.ttl : expires);
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this.destroyStmt.run(sid);
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }

  touch(sid, sess, cb) {
    try {
      const expires = sess && sess.cookie && sess.cookie.expires
        ? Date.parse(sess.cookie.expires)
        : Date.now() + this.ttl;
      this.touchStmt.run(Number.isNaN(expires) ? Date.now() + this.ttl : expires, sid);
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }
}

module.exports = SQLiteSessionStore;
