var config = {
  app: 8080,
  stream: 8081,
  token: 'foobar'
}

var HTTP = require('http')
  , SocketIO = require('socket.io')
  , net = require('net')
  , msgpack = require('msgpack')
  , sys = require('sys')
  , crypto = require('crypto')

var app = HTTP.createServer(function (request, response) {
  response.writeHead(301, {'Location': 'http://www.google.com/'});
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
  emitter: function(m, global) {
    var emitter = (global && m.global) ? io.sockets : io.sockets.sockets[m.socket];
    if(!emitter) return r({error: true, error_id: 404, message: 'socket not found'});
    if(m.broadcast) emitter = emitter.broadcast;
    if(m.volatile) emitter = emitter.volatile;
    if(m.json) emitter = emitter.json;
  }
}

var stream_handlers = {
  on: function(m, c, r) {
    var socket = io.sockets.sockets[m.socket];
    if(!socket) return r({error: true, error_id: 404, message: 'socket not found'});
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
    var emitter = util.emitter(m, true);
    emitter.emit(m.kind, m.message);
    r({type: 'emit', kind: m.kind, done: true});
  },
  send: function(m, c, r) {
    var emitter = util.emitter(m, true);
    emitter.send(m.message);
    r({type: 'send', done: true});
  },
  get: function(m, c, r) {
  },
  set: function(m, c, r) {
  }
};

var server = net.createServer(function (c) {
  authorized = false;
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
      if (handler) {
        handler(m, c, function(reply) {
          reply.reply_to = m.id;
          io.log.debug('stream ' + c.cid + ': replying - ' + sys.inspect(m));
          c.write(msgpack.pack(reply));
        });
      } else {
        io.log.error('stream ' + c.cid + ': handler for ' + m.type + ' not found, ignoring.');
      }
    } else if (!authorized) {
      if (m.auth == config.token) {
        authorized = true;
        c.write(msgpack.pack({auth: true}));
        streams[c.cid] = c;
        io.log.info('stream ' + c.cid + ': authorized');
      } else {
        c.write(msgpack.pack({auth: false}));
        io.log.warn('stream ' + c.cid + ': AUTH FAILED');
        c.destroy();
      }
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
