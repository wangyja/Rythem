(function(){

	/**
	 * Connection
	 * @param {uint} id
	 * @param {String} socketID
	 */
	var Connection = function(id, socketID){
		this.id = id;
		this.socketID = socketID;
		this.requestHeader = {};
		this.responseHeader = {};
	};
	Connection.prototype = {
		/**
		 * parse http request/response header
		 * @param {String} header
		 * @return {Object}
		 */
		parseHttpHeader: function(header){
			//split the header
			header = header.split('\r\n\r\n')[0];
			var lines = header.split('\r\n');

			//parse the header fields
			var i, len = lines.length, fields = {};
			for(i=1; i<len; i++){
				var kv = lines[i].split(': ');
				fields[kv[0]] = kv[1];
			}

			//parse the first line("GET /xxx HTTP/1.1" for request or "HTTP/1.1 200 OK" for response)
			var firstLine = lines[0].split(' ');
			var method, url, host, path, file, httpVersion, status, description;
			if(parseInt(firstLine[1])){
				//this is a response
				httpVersion = firstLine[0];
				status = parseInt(firstLine[1]);
				description = firstLine[2];
			}
			else{
				//this is a request
				method = firstLine[0];
				url = firstLine[1];
				httpVersion = firstLine[2];

				var uri = parseUri(url);
				host = uri.host || fields['Host'];
				path = uri.path;
				file = uri.file;
			}
			return {
				method: method,
				url: url,
				host: host,
				path: path,
				file: file,
				httpVersion: httpVersion,
				status: status,
				desc: description,
				fields: fields
			};
		},
		/**
		 * set request header
		 * @param {String} header
		 */
		setRequestHeader: function(header){
			this.requestHeader = this.parseHttpHeader(header);
			return this;
		},
		/**
		 * set response header
		 * @param {String} header
		 */
		setResponseHeader: function(header){
			this.responseHeader = this.parseHttpHeader(header);
			return this;
		},
		setHeaders: function(host, url, method, status, reqContentLength, respContentLength){
			var parsedUrl = parseUri(url);
			this.requestHeader = {
				method: method,
				url: url,
				host: host,
				path: parsedUrl.path,
				file: parsedUrl.file,
				contentLength: reqContentLength
			};
			this.responseHeader = {
				status: status,
				contentLength: respContentLength
			};
		},
		/**
		 * set request start time
		 * @param {int} time
		 */
		setStartTime: function(time){
			this.startTime = time;
			if(time > this.responseStartTime){
				this.setResponseStartTime(time);
				this.setResponseFinishTime(time);
			}
			return this;
		},
		/**
		 * set response start time(when you receive the first byte of the response)
		 * @param {int} time
		 */
		setResponseStartTime: function(time){
			//init startTime if it's not yet set
			if(!this.startTime){
				this.setStartTime(time);
			}
			//responseStartTime must not smaller than startTime,
			//and must not bigger than responseEndTime
			if(time < this.startTime){
				time = this.startTime;
			}
			if(time > this.responseFinishTime){
				this.setResponseFinishTime(time);
			}
			this.responseStartTime = time;
			return this;
		},
		/**
		 * set response finish time(when you received the complete response)
		 * @param {int} time
		 */
		setResponseFinishTime: function(time){
			//init starTime and responseStartTime if they are not yet set
			if(!this.responseStartTime){
				this.setResponseStartTime(time);
			}
			//responseEndTime must not smaller than responseStartTime
			if(this.responseStartTime > time) time = this.responseStartTime;
			this.responseFinishTime = time;
			return this;
		},
		getFullUrl: function(){
			return this.requestHeader.url || '?';
		},
		getRequestName: function(){
			return this.requestHeader.file || this.id.toString();
		},
		getRequestHost: function(){
			return this.requestHeader.host || '?';
		},
		getRequestMethod: function(){
			return this.requestHeader.method || '?';
		},
		getResponseStatus: function(){
			return this.responseHeader.status || 0;
		},
		getResponseContentLength: function(){
			return this.responseHeader.contentLength || 0;
		},
		getStartTime: function(){
			return this.startTime
		},
		getResponseStartTime: function(){
			return this.responseStartTime
		},
		getResponseFinishTime: function(){
			return this.responseFinishTime
		},
		getWaitTime: function(){
			return this.responseStartTime - this.startTime;
		},
		getResponseTime: function(){
			return this.responseFinishTime - this.responseStartTime;
		},
		getSessionTime: function(){
			return this.responseFinishTime - this.startTime;
		},
		toString: function(){
			return JSON.stringify({
				id: 				this.id,
				socketID: 			this.socketID,
				startTime: 			this.getStartTime(),
				responseStartTime: 	this.getResponseStartTime(),
				responseFinishTime: this.getResponseFinishTime(),
				waitTime: 			this.getWaitTime(),
				responseTime: 		this.getResponseTime(),
				sessionTime: 		this.getSessionTime()
			});
		}
	};
	Connection.sockets = {};
	Connection.conns = {};
	/**
	 * create a new connection instance, or return an existing one
	 * @param {uint} id
	 * @param {String} [socketID=undefined]
	 */
	Connection.get = function(id, socketID){
		var conn;
		if(Connection.conns[id]){
			conn = Connection.conns[id];
		}
		else{
			conn = new Connection(id, socketID);
			if(!Connection.sockets[socketID]){
				Connection.sockets[socketID] = [];
			}
			Connection.sockets[socketID].push(conn);
			Connection.conns[id] = conn;
		}
		return conn;
	};
	Connection.setRequestHeader = function(id, header){
		return Connection.get(id).setRequestHeader(header);
	};
	Connection.setResponseHeader = function(id, header){
		return Connection.get(id).setResponseHeader(header);
	};
	Connection.setStartTime = function(id, time){
		return Connection.get(id).setStartTime(time);
	};
	Connection.setResponseStartTime = function(id, time){
		return Connection.get(id).setResponseStartTime(time);
	};
	Connection.setResponseFinishTime = function(id, time){
		return Connection.get(id).setResponseFinishTime(time);
	};


	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

	var socketGroupsEl = document.getElementById('socketGroups');
	var startTime = 0;

	function getSocketUI(socketID){
		var el = document.getElementById('socket-' + socketID);
		if(el){
			return el;
		}
		else{
			var group = document.createElement('article');
			group.id = 'socket-' + socketID;
			group.className = 'socket hgroup';
			group.innerHTML = '<header>' + socketID + '</header><div class="conns hgroup"></div>';
			socketGroupsEl.appendChild(group);
			return group;
		}
	}

	function updateConnUI(conn){
		var el = document.getElementById('conn-' + conn.id);
		if(el){
			el.querySelector('.name').textContent = conn.getRequestName();
			el.querySelector('.host').textContent = conn.getRequestHost();
			el.querySelector('.detail').textContent = conn.getRequestMethod() + ' ' + conn.getResponseStatus();
			return el;
		}
		else{
			var waitTime = conn.getWaitTime();
			var responseTime = conn.getResponseTime();
			var waitTimeLen = Math.round(waitTime/100) || 1;
			var totalTimeLen = (Math.round(responseTime/100) || 1) + waitTime;
			var detailText = [
				conn.getRequestMethod(),
				conn.getResponseStatus(),
				conn.getResponseContentLength()/1000 + 'KB'
			].join(' ');
			var timeText = [
				waitTime,
				waitTime + responseTime
			].join('/');
			var item = document.createElement('div');
			item.id = 'conn-' + conn.id;
			item.className = 'conn min';
			item.innerHTML = '\
				<div class="info">\
					<div class="name">' + conn.getRequestName() + '</div>\
					<div class="host">' + conn.getRequestHost() + '</div>\
					<div class="detail">' + detailText + '</div> \
				</div>\
				<div class="time" style="width:' + totalTimeLen + 'px" title="' + timeText + '">\
					<div class="wait" style="width:' + waitTimeLen + 'px" title="' + timeText + '"></div>\
				</div>';
			var socket = getSocketUI(conn.socketID);
			socket.querySelector('.conns').appendChild(item);
			return item;
		}
	}

	/**
	 * update all connections, this method is invoke by the client
	 * conns = [conn1, conn2, ...]
	 * conn = {id, socketID, requestHeader, responseHeader, startTime, responseStartTime, responseFinishTime}
	 * @param conns
	 */
	function updateAllConnections(conns){
		var i, len=conns.length;
		for(i=0; i<len; i++){
			var conn = conns[i];
			var c = Connection.get(conn.id, conn.socketID);
			if(!startTime){
				startTime = c.startTime;
			}
			c.setHeaders(
				conn.host, conn.url, conn.method, conn.status,
				conn.requestContentLength, conn.responseContentLength
			);
			c.setStartTime(conn.startTime);
			c.setResponseStartTime(conn.responseStartTime);
			c.setResponseFinishTime(conn.responseFinishTime);
			updateConnUI(c);
		}
	}

	function main(){
		var c = Connection.get(1, 2);
		updateConnUI(c);
	}

	document.addEventListener('DOMContentLoaded', main);
	document.documentElement.delegate('.conn', 'click', function(e, el){
		el.classList.toggle('min');
	}, false, true);

	window.Connection = Connection;
	window.updateAllConnections = updateAllConnections;

})();