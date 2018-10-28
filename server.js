var fsPath = require("path");
var util = require('util');
var url = require('url');
var minihttp = require("minihttp");
var WebSocket = require('socket.io');
var fs = require("fs");
//var fsPath = require("path");


var config_name = './Options';
console.log( 'Option file is %s', config_name );

var Config = require( config_name );
try {
	Config = require( config_name ).Options;
}
catch( e ) {
	console.log( 'Cannot load configuration: %s', e );
}


var Server = new minihttp.HttpServer( Config.web );


Server.route( '/api/reload', function( request, response, parms )
{
	console.log('Reloading database...');
	var callback = defaultCallback( response );

	Database.reload( function(err)
	{
		if(err)
			callback('ERR: reload db failed - '+err);
		else
			callback();
	});
});

var DisplayChannel = null;

var Promise =require('promise');

function WS( http ) {

	this.io = new WebSocket(Server.http);
	this.clients = {};

	//this.info = function() {
	//	console.log( '[WS] info: %s', util.inspect( Object.keys( this.clients ) ) );
	//};

	var me = this;
	this.io.sockets.on( 'connection', function(socket) {
		var client_ip = null;
		try {
			client_ip = socket.request.connection.remoteAddress;
		}
		catch( e ) {}
		
		console.log( '[WS] a display connected from %s', client_ip || 'unknown ip' );
		//me.clients[ socket.id ] = socket;
		socket.on( 'disconnect', function() {
			var ids = Object.keys(me.clients);
			for( var i=0; i<ids.length; i++ ) {
				var id = ids[i];
				var client = me.clients[id];
				if( client.socket && client.socket.id == socket.id ) {
					client.socket = null;
					client.active = false;
				}
			}
			console.log( '[WS] display DISconnected %s, sk:%s', id, socket.id );
			//me.info();
		});
		socket.on( 'hello', function(msg) {
			var id = msg.id;
			
			console.log( '[WS] hello from client: %s, sk:%s', id ? id : '<not registered>', socket.id );

			var d = { ip_address: client_ip };

			if( id != null ) {
				d.id = id;
				me.register( id, socket );
			}
			else {
				//console.log('[WS] setting template at default template id (%s)',me.default_template_id );
				//d.template_id = me.default_template_id+'';
			}

			//me.info();
			
			// TODO: get the video player params from db or options
			var msg = {
				video_id: Config.video.id
			};
			
			me.send( id, 'setup', msg );

		});
		socket.on( 'start', function(msg) {
			
			me.sendToAll( 'play', msg );

		});

		socket.emit( 'hello' );
	});

};

WS.prototype.register = function(id, socket) {
	if( !socket )
		return;

	var client = this.clients[id];
	if( client ) {
		// already registered: update socket
		client.socket = socket;
		client.active = true;
		return;
	}
	
	client = {
		id: id
		,socket: socket
		,active: true
	};
	this.clients[id] = client;
};

WS.prototype.sendToAll = function( name, message ) {
	if( this.io )
		this.io.emit( name, message );
};

WS.prototype.send = function( id, action, data ) {
	var client = this.clients[id];
	if( !client || !client.socket )
		return false;
	
	try	{
		client.socket.emit( action, data );
		return true;
	}
	catch( e ) {
		console.log( 'WS send failed: %s', e );
		return false;
	}
	
};

function start() {
	Server.listen();
	DisplayChannel = new WS( Server.http );
}

start();
