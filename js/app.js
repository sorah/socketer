var config = {
  app: process.argv[2],
  stream: process.argv[3],
  token: process.argv[4],
  token_changed: false
}
if (config.app.match(/^\d+$/))    config.app    = parseInt(config.app, 10);
if (config.stream.match(/^\d+$/)) config.stream = parseInt(config.stream, 10);

var HTTP = require('http')
  , SocketIO = require('socket.io')
  , net = require('net')
  , msgpack = require('msgpack')
  , sys = require('sys')
  , crypto = require('crypto')

var app = HTTP.createServer(function (request, response) {
  response.writeHead(404, {});
  response.end('');
});
app.listen(config.app);
var io = SocketIO.listen(app);
io.log.info('Listening app');

var streams = {};
streams.broadcast = function (msg) {
  for(var k in streams) {
    if(!streams.hasOwnProperty(k)) continue;
    if(typeof streams[k] == 'function') continue;
    streams[k].write(msgpack.pack(msg));
  }
}
var stream_hooks = {};

var util = {
  emitter: function(m, r, global) {
    var emitter = (global && m.global) ? io.sockets : io.sockets.sockets[m.socket];
    if(!emitter) {
      r({error: 404, message: 'socket not found'});
      return null;
    }
    if(m.broadcast) emitter = emitter.broadcast;
    if(m.volatile) emitter = emitter.volatile;
    if(m.json) emitter = emitter.json;
    return emitter;
  }
}

var stream_handlers = {
  on: function(m, c, r) {
    // TODO: socket less hook
    var socket = io.sockets.sockets[m.socket];
    if(!socket) return r({error: 404, message: 'socket not found'});
    if(!stream_hooks[c.cid]) stream_hooks[c.cid] = {};

    var hid = crypto.createHash('md5').update(c.cid+Date.now()+m.kind+m.socket).digest('hex');

    var hook = function(data, callback) {
      console.log(hook.hid + " callback:", data);
      c.write(msgpack.pack({
        type: 'event',
        hook: hook.hid,
        data: data
      }));
    }
    socket.on(m.kind, hook);
    hook.hid = hid;

    stream_hooks[c.cid][hook.hid] = hook;
    r({type: 'on', kind: m.kind, hook: hook.hid});
  },
  emit: function(m, c, r) {
    var e = util.emitter(m, r, true); if(!e) return;
    e.emit(m.kind, m.message);
    r({type: 'emit', kind: m.kind, done: true});
  },
  send: function(m, c, r) {
    var e = util.emitter(m, r, true); if(!e) return;
    e.send(m.message);
    r({type: 'send', done: true});
  },
  get: function(m, c, r) {
    var socket = io.sockets.sockets[m.socket];
    if(!socket) return r({error: 404, message: 'socket not found'});

    r({type: 'get', socket: m.socket, key: m.key, value: socket.get(m.key)});
  },
  set: function(m, c, r) {
    var socket = io.sockets.sockets[m.socket];
    if(!socket) return r({error: 404, message: 'socket not found'});

    socket.set(m.key, m.value);
    r({type: 'set', socket: m.socket, key: m.key});
  },
  set_token: function(m, c, r) {
    if(config.token_changed) return r({error: 406, message: 'token already set, cannot overwrite'});
    config.token = m.token;
    config.token_changed = true;
    r({type: 'set_token', done: true});
  }
};

var server = net.createServer(function (c) {
  var authorized = false;
  c.cid = crypto.createHash('md5').update(c.remoteAddress + c.remotePort + Date.now()).digest('hex');

  io.log.info('stream: new connection - ' + c.cid);
  c.on('end', function() {
    delete streams[c.cid];
    io.log.info('stream: connection end - ' + c.cid);
  });

  var ms = new msgpack.Stream(c);
  ms.addListener('msg', function (m) {
    if (authorized && m.type) {
      io.log.debug('stream ' + c.cid + ': handle - ' + sys.inspect(m));

      var handler = stream_handlers[m.type];
      if (!handler) {
        io.log.error('stream ' + c.cid + ': handler for ' + m.type + ' not found, ignoring.');
        c.write(msgpack.pack({error: 400, message: 'handler for "' + m.type + '" not found.', reply_to: m.id}));
        return;
      }

      handler(m, c, function(reply) {
        reply.reply_to = m.id;
        io.log.debug('stream ' + c.cid + ': replying - ' + sys.inspect(m));
        c.write(msgpack.pack(reply));
      });
    } else if (!authorized) {
      if (m.auth == config.token) {
        authorized = true;
        streams[c.cid] = c;
        c.write(msgpack.pack({auth: true}));

        io.log.info('stream ' + c.cid + ': authorized');
      } else {
        c.write(msgpack.pack({auth: false}));
        c.destroy();

        io.log.warn('stream ' + c.cid + ': AUTH FAILED');
      }
    } else {
      io.log.error('stream ' + c.cid + ': no type specified, ignoreing.')
      c.write(msgpack.pack({error: 400, message: "'type' not specified"}));
    }
  });
});
server.listen(config.stream);
io.log.info('Listening stream');

io.sockets.on('connection', function (socket) {
  streams.broadcast({type: 'connect', socket: socket.id});
  var sockid = socket.id;

  socket.on('disconnect', function (sock) {
    streams.broadcast({type: 'disconnect', socket: sockid});
  });
});
