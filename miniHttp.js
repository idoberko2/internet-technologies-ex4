var net = require('net');
var events = require('events');

if (!String.prototype.trim) {
    String.prototype.trim = function () {
        return this.replace(/^\s+|\s+$/gm, '');
    };
}


var STATUS_CODES = {
    100: 'Continue',
    200: 'OK',
    400: 'Bad Request',
    404: 'Not Found',
    405: 'Method Not Allowed',
    500: 'Internal Server Error'
};

module.exports.STATUS_CODES = STATUS_CODES;

var DEFAULT_TIMEOUT = 120000; // two minutes in milliseconds
var DEFAULT_MAX_HEADERS = 1000;


module.exports.createServer = function (listener){
    var server = new Server();

    if (listener !== undefined){
        server.on('request', listener);
    }

    return server;
};


/****************************
 * miniHttp.Server object
 ****************************/

function Server(){
    var that = this;

    var netServer = net.createServer(function (socket){
        var requestBuffer = '';
        var pendingMessage = null;
        var pendingBody = '';

        socket.setTimeout(that.timeout, function() {
            socket.end();
        });

        socket.on('data', function(data){
            requestBuffer += data;

            while (requestBuffer.indexOf('\r\n\r\n') !== -1){
                // incoming message's headers final index
                var headersFinalIndex = requestBuffer.indexOf('\r\n\r\n') + 4;
                var request;

                // create message object and cut from the buffer
                try {
                    request = new IncomingMessage(socket,
                        requestBuffer.substr(0, headersFinalIndex));
                } catch (ex) {
                    console.log(ex.stack);
                    socket.end();
                    return;
                }
                request.setTimeout(DEFAULT_TIMEOUT, socket.close);

                requestBuffer = requestBuffer.substr(headersFinalIndex);

                // handle message's body if needed
                if (request.headers['contentLength'] !== undefined){
                    var contLength = request.headers['contentLength'];
                    pendingMessage = request;
                    pendingBody += requestBuffer.substr(0, contLength);
                    if (requestBuffer.length > contLength){
                        requestBuffer = requestBuffer.substr(contLength);
                    } else { // only part of the data arrived
                        requestBuffer = '';
                    }
                // if no body is expected, handle immediately
                } else {
                    that.emit('request', request, new ServerResponse(socket));
                }
            }

            // handling message's body
            if (requestBuffer.length > 0){
                var contLength = pendingMessage.headers['contentLength'];
                var messageFinalIndex;
                if (requestBuffer.length + pendingBody.length > contLength){
                    messageFinalIndex = contLength - pendingBody.length;
                } else {
                    messageFinalIndex = requestBuffer.length;
                }
                pendingBody += requestBuffer.substr(0, messageFinalIndex);
                requestBuffer = requestBuffer.substr(messageFinalIndex);
            }

            // send the message if all the content received
            if (pendingMessage !== null && pendingBody.length == contLength){
                pendingMessage.rawBody = pendingBody;
                that.emit('request', pendingMessage,
                    new ServerResponse(socket));
                pendingMessage = null;
                pendingBody = '';
            }
        });
    });

    // if net.Server emits, emit
    netServer.on('listening', function (){
        that.emit('listening');
    });

    // if net.Server emits, emit
    netServer.on('connection', function(socket){
        that.emit('connection', socket);
    });

    // if net.Server emits, emit
    netServer.on('error', function (err){
        that.emit('error', err);
    });

    that.maxHeadersCount = DEFAULT_MAX_HEADERS;
    that.timeout = DEFAULT_TIMEOUT;

    // getter for local variable netServer
    that.getNetServer = function (){
        return netServer;
    };
}

// inherit EventEmitter
Server.prototype = Object.create(events.EventEmitter.prototype);

Server.prototype.listen = function (port, callback){
    this.getNetServer().listen(port, callback);
};

Server.prototype.close = function (callback){
    var myServer = this;
    myServer.getNetServer().on('close', function (){
        myServer.emit('close');
    });
    myServer.getNetServer().close(callback);
};

Server.prototype.setTimeout = function (msecs, callback){
    this.timeout = msecs;
};

/****************************
 * end of miniHttp.Server
 ****************************/

function InvalidMessage(message) {
    this.message = message;
}

InvalidMessage.prototype = new Error();
InvalidMessage.prototype.name = "InvalidMessage";
InvalidMessage.prototype.constructor = InvalidMessage;

/************************************
 * miniHttp.IncomingMessage object
 ************************************/

function IncomingMessage(socket, httpRequest){
    var that = this;
    that.socket = socket;
    that.headers = {};

    var dataArr = httpRequest.toString().split(/\r?\n/gm);
    var requestHeaderArr = dataArr[0].split(/\s+/);

    if (requestHeaderArr.length !== 3)
    {
        throw new InvalidMessage('Invalid message header: ' + dataArr[0]);
    }

    that.method = requestHeaderArr[0].toUpperCase();
    that.url = requestHeaderArr[1];
    that.httpVersion = requestHeaderArr[2];

    for (var i = 1; i < dataArr.length; ++i){
        var requestLineArr = dataArr[i].split(/\s?:\s?/);
        if (requestLineArr.length === 2){
            var key = requestLineArr[0].toLowerCase().trim();
            var value = requestLineArr[1].trim();
            if (key.indexOf('-') != -1){
                var capitalIndex = key.indexOf('-');
                key = key.replace('-', '');
                key = key.substring(0, capitalIndex) +
                    key.charAt(capitalIndex).toUpperCase() +
                    key.substring(capitalIndex + 1);
            }
            // split to array if needed
            if (value.match(/.*;.*/g)){
                value = value.split(/ ?; ?/g);
            }

            if (that.headers[key] === undefined){
                that.headers[key] = [];
            }
            
            // the only way to avoid array's conversion to string
            if (Array.isArray(value)){
                for (var j = 0; j < value.length; ++j){
                    that.headers[key].push(value[j]);
                }
            } else {
                that.headers[key].push(value);
            }
        }
    }

    that.setTimeout = function(msecs, callback){
        socket.setTimeout(msecs, callback);
    };
}

IncomingMessage.prototype = Object.create(events.EventEmitter.prototype);

/************************************
 * end of miniHttp.IncomingMessage
 ************************************/


/************************************
 * miniHttp.ServerResponse object
 ************************************/

function ServerResponse(socket){
    var that = this;
    that.socket = socket;
    that.headers = {};
    that.statusCode = 0;
    that.writeHeadCalled = false;
    that.headersSent = false;
    that.sendDate = true;
}

ServerResponse.prototype = Object.create(events.EventEmitter.prototype);

ServerResponse.prototype.setHeader = function (name, value){
    this.headers[name] = value;
};

ServerResponse.prototype.getHeader = function (name){
    return this.headers[name];
};

ServerResponse.prototype.removeHeader = function (name){
    if (this.headers[name] !== undefined){
        delete this.headers[name];
    }
};

function addHeadersToString(headers){
    var strToReturn = '';
    if (headers !== undefined){
        for (var key in headers){
            strToReturn += key + ': ';

            if (Array.isArray(headers[key])){
                if (key.toLowerCase() === 'set-cookie'){
                    for (var i = 0; i < headers[key].length; ++i){
                        strToReturn += headers[key][i];
                        if (i !== headers[key].length - 1){
                            strToReturn += '\r\n' + key + ': ';
                        }
                    }
                } else {
                    for (var i = 0; i < headers[key].length; ++i){
                        strToReturn += headers[key][i];
                        if (i !== headers[key].length - 1){
                            strToReturn += '; ';
                        }
                    }
                }
            } else {
                strToReturn += headers[key];
            }

            strToReturn += '\r\n';
        }
    }

    return strToReturn;
}

ServerResponse.prototype.writeHead = function (statusCode, headers){
    var thisMessage = this;
    var headStr;

    thisMessage.writeHeadCalled = true;
    headStr = 'HTTP/1.1 ' + statusCode + ' ' + STATUS_CODES[statusCode]
        + '\r\n';

    headStr += addHeadersToString(thisMessage.headers);
    headStr += addHeadersToString(headers);

    headStr += '\r\n';

    this.socket.write(headStr, function (){
        thisMessage.emit('headerWritten');
        thisMessage.headersSent = true;
    });
};

ServerResponse.prototype.write = function (chunk){
    var thisMessage = this;

    if (!thisMessage.writeHeadCalled){
        if (thisMessage.sendDate && thisMessage.headers['Date'] === undefined){
            thisMessage.headers['Date'] = getDateTime();
        }

        thisMessage.writeHead(200, thisMessage.headers);
    } else if (!thisMessage.headersSent) {
        thisMessage.once('headerWritten', function (){
            return thisMessage.socket.write(chunk, function (){
                thisMessage.emit('finish');
            });
        });
    } else {
        return thisMessage.socket.write(chunk, function (){
            thisMessage.emit('finish');
        });
    }
};

ServerResponse.prototype.writeContinue = function (){
    var thisMessage = this;

    thisMessage.writeHead(100);
};

ServerResponse.prototype.end = function (data){
    var thisMessage = this;

    if (data !== undefined){
//        thisMessage.setHeader('Content-Length', data.length);
        thisMessage.on('finish', thisMessage.socket.end);
        thisMessage.write(data);
    } else {
        thisMessage.socket.end();
    }
};

ServerResponse.prototype.setTimeout = function (msecs, callback){
    var thisMessage = this;

    thisMessage.socket.setTimeout(msecs, callback);
};

/************************************
 * end of miniHttp.ServerResponse
 ************************************/


function getTwoDigitLeadingZero(num){
    return (num < 10 ? '0' : '') + num;
}


function getDateTime() {
    var date = new Date();
    var hour = getTwoDigitLeadingZero(date.getHours());
    var min  = getTwoDigitLeadingZero(date.getMinutes());
    var sec  = getTwoDigitLeadingZero(date.getSeconds());
    var year = date.getFullYear();
    var month = getTwoDigitLeadingZero(date.getMonth() + 1);
    var day  = getTwoDigitLeadingZero(date.getDate());

    return year + '/' + month + '/' + day + ' ' + hour + ':' + min + ':' + sec;

}