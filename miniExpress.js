var fs = require('fs');
var events = require('events');
var querystring = require('querystring');

var miniHttp = require('./miniHttp');



if (typeof String.prototype.startsWith != 'function') {
    String.prototype.startsWith = function (str){
        return this.slice(0, str.length) == str;
    };
}

function isNumber(value){
    return !isNaN(value);
}

// regex for a single parameter
var PARAMETER_REGEX = /\/:([a-z0-9_]*)/gi;

// standard content types
var CONTENT_TYPES = {
    'js': 'application/javascript',
    'txt': 'text/plain',
    'html': 'text/html',
    'css': 'text/css',
    'jpg': 'image/jpeg',
    'gif': 'image/gif',
    'png': 'image/png'
};

// extract parameter names out of a given path
function getParamNames(path){
    var arrToReturn = [];
    var match = PARAMETER_REGEX.exec(path);

    while (match !== null){
        arrToReturn.push(match[1]);
        match = PARAMETER_REGEX.exec(path);
    }

    return arrToReturn;
}

// object that will represent a single middle ware
function Middleware(path, handler, index, method){
    var that = this;

    that.pattern = new RegExp('^' + path.replace(PARAMETER_REGEX, '\/([^/]+)') +
        '(\/?.*)*$', '');
    that.keys = getParamNames(path);
    that.method = method;

    that.index = index;

    if (typeof path == 'function'){
        that.path = '/';
        that.handler = path;
    } else {
        that.path = path;
        that.handler = handler;
    }

    // check if a given path and method match this middle ware
    that.isMatch = function (path, reqMethod){
        if (path.match(that.pattern)){
            if (that.method !== undefined && that.method !== reqMethod){
                return false;
            } else {
                return true;
            }
        } else {
            return false;
        }
    };
}


// data structure to contain middle wares
function MiddlewareQueue(){
    var that = this;
    var queue = [];
    var curIndex = 0;

    that.add = function (path, handler, method){
        if (typeof path == 'function'){
            queue.push(new Middleware('/', path, curIndex++, handler));
        } else {
            queue.push(new Middleware(path, handler, curIndex++, method));
        }
    };

    that.get = function (index){
        return index >= queue.length ? null : queue[index];
    };

    // searches for the next matching middle ware, starting from index
    that.getNext = function (index, path, reqMethod){
        while (index < that.count()){
            if (queue[index].isMatch(path, reqMethod)){
                return queue[index];
            }

            ++index;
        }

        return null;
    }

    that.count = function (){
        return queue.length;
    };

    that.routes = function (){
        var routes = {};

        for (var i = 0; i < queue.length; ++i){
            if (queue[i].method !== undefined){
                var method = queue[i].method.toLowerCase();
                var mwObj = {};

                mwObj.path = queue[i].path;
                mwObj.method = method;
                // TODO: support multi-callbacks
                mwObj.callbacks = [queue[i].handler];
                // TODO: find out what keys are
                mwObj.keys = queue[i].keys;
                mwObj.regexp = queue[i].pattern;

                if (routes[method] === undefined){
                    routes[method] = [];
                }

                routes[method].push(mwObj);
            }
        }

        return routes;
    };
}


module.exports = miniExpress;


function parseRequest(httpRequest, middleware){
    if (httpRequest.host === undefined){
        httpRequest.host = {};
    }

    // setting params
    if (middleware.keys.length > 0 && middleware.pattern.test(httpRequest.url)){
        var match = middleware.pattern.exec(httpRequest.url);
        if (httpRequest.params === undefined){
            httpRequest.params = {};
        }

        // until -1 because last group is the sub-path
        for (var i = 1; i < match.length - 1; ++i){
            httpRequest.params[middleware.keys[i - 1]] = match[i];
        }
    }

    // setting query
    if (!httpRequest.query){
        httpRequest.query = querystring.parse(httpRequest.url.replace(/.*\?/g, ''));
    }

    // setting path (deleting querystring)
    if (!httpRequest.path){
        httpRequest.path = httpRequest.url.replace(/\?.*/g, '');
    }

    // setting host
    if (httpRequest.headers['host'] !== undefined){
        // if there was more than one host header, take the last one
        httpRequest.host =
            httpRequest.headers['host'][httpRequest.headers['host'].length - 1];
        httpRequest.host = httpRequest.host.replace(/:[0-9]+/, '');
    }

    // setting protocol to http
    httpRequest.protocol = 'http';

    httpRequest.get = function (field){
        field = field.toLowerCase().trim();
        if (field.indexOf('-') != -1){
            var capitalIndex = field.indexOf('-');
            field = field.replace('-', '');
            field = field.substring(0, capitalIndex) +
                field.charAt(capitalIndex).toUpperCase() +
                field.substring(capitalIndex + 1);
        }

        return httpRequest.headers[field];
    };

    httpRequest.param = function (name){
        if (httpRequest.params && httpRequest.params[name] !== undefined){
            return httpRequest.params[name];
        } else if (httpRequest.body && httpRequest.body[name] !== undefined){
            return httpRequest.body[name];
        } else if (httpRequest.query && httpRequest.query[name] !== undefined){
            return httpRequest.query[name];
        }

        return undefined;
    };

    httpRequest.is = function (type){
        var actualType = httpRequest.get('Content-Type');
        if (actualType !== undefined){
            if (Array.isArray(actualType)){
                for (var i = 0; i < actualType.length; ++i){
                    if (actualType[i].toLowerCase() === type.toLowerCase()){
                        return true;
                    }
                }
            } else {
                return actualType.toLowerCase() === type.toLowerCase();
            }
        }

        return false;
    };

    httpRequest.route = {
        path: middleware.path,
        method: httpRequest.method,
        callbacks: [middleware.handler],
        // TODO: find out what keys are
        keys: middleware.keys,
        regexp: middleware.pattern
    };

    return httpRequest;
}


function parseResponse(httpResponse){
    var headersSent = false;

    httpResponse.set = function (field, value){
        if (value !== undefined){ // which means it's a single argument call
            httpResponse.setHeader(field, value);
        } else { // which means it's a multi-arguments call
            for (var key in field){
                httpResponse.setHeader(key, field[key]);
            }
        }
    };

    httpResponse.status = function (code){
        httpResponse.statusCode = code;

        // for the chainable effect
        return httpResponse;
    };

    httpResponse.get = function (field){
        return httpResponse.getHeader(field);
    };

    httpResponse.cookie = function (name, value, options){
        var cookieStr = name + '=';

        if (typeof value === 'object'){
            cookieStr += JSON.stringify(value);
        } else {
            cookieStr += value;
        }

        if (options !== undefined){
            if (options.expires !== undefined){
                cookieStr += '; Expires=' + options.expires;
            }
            if (options.path !== undefined){
                cookieStr += '; Path=' + options.path;
            }
            if (options.domain !== undefined){
                cookieStr += '; Domain=' + options.domain;
            }
            if (options.httpOnly !== undefined && options.httpOnly){
                cookieStr += '; HttpOnly';
            }
            if (options.secure !== undefined && options.secure){
                cookieStr += '; Secure';
            }
        }

        var cookieArr;
        if (httpResponse.get('Set-Cookie') !== undefined){
            cookieArr = httpResponse.get('Set-Cookie');
        } else {
            cookieArr = [];
        }

        cookieArr.push(cookieStr);
        httpResponse.set('Set-Cookie', cookieArr);
    };


    httpResponse.send = function (bodyOrStatus, body){
        if (body === undefined){
            // only status code
            if (isNumber(bodyOrStatus)){
                httpResponse.writeHead(bodyOrStatus, {
                    'Content-Type': 'text/plain',
                    'Content-Length': miniHttp.STATUS_CODES[bodyOrStatus].length
                });
                httpResponse.write(miniHttp.STATUS_CODES[bodyOrStatus]);
                headersSent = true;
            // only body, header wasn't sent yet
            } else if (!headersSent) {
                if (httpResponse.getHeader('Content-Type') === undefined){
                    httpResponse.setHeader('Content-Type',
                        ['text/html', 'charset=UTF-8']);
                }
                if (httpResponse.getHeader('Content-Length') === undefined){
                    httpResponse.setHeader('Content-Length',
                        bodyOrStatus.length);
                }
                httpResponse.writeHead(200);
                headersSent = true;
                httpResponse.write(bodyOrStatus);
            // only body, header was already sent
            } else {
                httpResponse.write(bodyOrStatus);
            }
        // both status code and body
        } else {
            if (httpResponse.getHeader('Content-Type') === undefined){
                httpResponse.setHeader('Content-Type',
                    ['text/plain', 'charset=UTF-8']);
            }
            if (httpResponse.getHeader('Content-Length') === undefined){
                httpResponse.setHeader('Content-Length', body.length);
            }
            httpResponse.writeHead(bodyOrStatus);
            headersSent = true;
            httpResponse.write(body);
        }

        httpResponse.emit('sent');
    };


    httpResponse.json = function (bodyOrStatus, body){
        if (body === undefined){
            if (httpResponse.getHeader('Content-Type') === undefined){
                httpResponse.setHeader('Content-Type',
                    ['application/json', 'charset=UTF-8']);
            }
            if (httpResponse.getHeader('Content-Length') === undefined){
                httpResponse.setHeader('Content-Length',
                    JSON.stringify(bodyOrStatus).length);
            }
            httpResponse.writeHead(200);
            httpResponse.write(JSON.stringify(bodyOrStatus));
        } else {
            if (httpResponse.getHeader('Content-Type') === undefined){
                httpResponse.setHeader('Content-Type',
                    ['application/json', 'charset=UTF-8']);
            }
            if (httpResponse.getHeader('Content-Length') === undefined){
                httpResponse.setHeader('Content-Length',
                    JSON.stringify(body).length);
            }
            httpResponse.writeHead(bodyOrStatus);
            httpResponse.write(JSON.stringify(body));
//            httpResponse.end();
        }

        httpResponse.emit('sent');
    };

    return httpResponse;
}


function miniExpress() {
    var middlewares = new MiddlewareQueue();
    var httpServer;

    // object to return
    var listener = function (request, response){
        var nextIndex = 0; // index of mw's (to start looking from)
        var isFound = false; // flag if handler was found
        var isSent = false; // flag if response was sent

        // express's main function. Finds the middle ware and runs it
        var executeNextFunction = function (){
            // get next suiting middle ware
            var currentMw = middlewares.getNext(nextIndex, request.url,
                request.method);

            // if there is one
            if (currentMw !== null){
                nextIndex = currentMw.index + 1;
                isFound = true;
                var requestObj = parseRequest(request, currentMw);

                // check for unsupported methods
                if (requestObj.method !== 'GET' &&
                    requestObj.method !== 'POST' &&
                    requestObj.method !== 'PUT' &&
                    requestObj.method !== 'DELETE'){

                    var methodNotAllowed = 'Method ' + request.method + ' is' +
                        ' not allowed';
                    response.writeHead(405, {
                        'Content-Length': methodNotAllowed.length,
                        'Content-Type': 'text/plain'
                    });
                    response.write(methodNotAllowed);

                    return;
                }

                var responseObj = parseResponse(response);
                responseObj.once('sent', function (){
                    isSent = true;
                });

                // execute current middle ware. surrounded with try in order to
                // protect the server from user mistakes
                try {
                    // pass executeNextFunction as next
                    currentMw.handler(requestObj, responseObj,
                        executeNextFunction);
                } catch (ex) {
                    console.log(ex.stack);
                }

            // if no handler was found or nothing was sent, return 404
            } else if (!isFound || !isSent) {
                var notFoundBody = 'Cannot ' + request.method + ' ' +
                    request.url;
                response.writeHead(404, {
                    'Content-Length': notFoundBody.length,
                    'Content-Type': 'text/plain'
                });
                response.write(notFoundBody);
            }
        };

        executeNextFunction();
    };

    listener.use = function (path, func) {
        middlewares.add(path, func);
    };

    listener.get = function (path, func){
        middlewares.add(path, func, 'GET');
    };

    listener.post = function (path, func){
        middlewares.add(path, func, 'POST');
    };

    listener.delete = function (path, func){
        middlewares.add(path, func, 'DELETE');
    };

    listener.put = function (path, func){
        middlewares.add(path, func, 'PUT');
    };

    listener.route = function (){
        return middlewares.routes();
    };

    listener.listen = function (port, callback) {
        httpServer = miniHttp.createServer(listener);
        httpServer.on('error', function (err){
            console.log(err.message);
        });
        httpServer.listen(port, function() { //'listening' listener

            if (callback !== undefined){
                callback();
            }
        });

        return httpServer;
    };

    return listener;
};


function hasExtension(fileName){
    return (new RegExp('.*\..*')).test(fileName);
}


module.exports.static = function (folder){
    return function (request, response, next) {
        if (request.httpVersion !== 'HTTP/1.1' &&
            request.get('Connection') !== undefined &&
                request.get('Connection').toLowerCase() !== 'keep-alive'){
            response.end();
        } else if (request.method === 'GET'){
            var requestedFile =
                request.path.replace(new RegExp(request.route.regexp), '$1');
            requestedFile = requestedFile.replace(/^\//, '');

            // if requested file is empty, default is index.html
            requestedFile = requestedFile === '' ? 'index.html' : requestedFile;

            // adding backslash to folder if needed
            folder = folder.charAt(folder.length - 1) === '\\' ?
                folder : folder + '\\';

            // resource = folder + file
            var physicalResource =
                (folder + requestedFile).replace(/\//g, '\\');

            fs.exists(physicalResource, function (exists) {
                if (exists){
                    var extension;
                    if (hasExtension(requestedFile)){
                        extension = requestedFile.substring(
                            requestedFile.lastIndexOf('.') + 1,
                            requestedFile.length);
                    } else {
                        // default type is text/html
                        extension = 'html';
                    }
                    response.set('Content-Type', CONTENT_TYPES[extension]);

                    fs.stat(physicalResource, function(err, stats){
                        response.set('Content-Length', stats.size);
                        var stream = fs.createReadStream(physicalResource);
                        stream.on('readable', function (){
                            var chunk;
                            while ((chunk = stream.read()) !== null){
                                response.send(chunk);
                            }
                        });
                    });

                } else {
                    next();
                }
            });
        } else if (request.method !== 'GET') {
            next();
        }
    };
};


module.exports.cookieParser = function (){
    return function (request, response, next){
        if (request.cookies === undefined){
            request.cookies = {};
        }

        if (request.headers['cookie'] !== undefined){
            for (var i = 0; i < request.headers['cookie'].length; ++i){
                var keyVal = request.headers['cookie'][i].split(/\s?=\s?/g);
                request.cookies[keyVal[0]] = keyVal[1];
            }
        }

        next();
    };
};


function json(request){
    if (request.is('application/json')){
        request.body = JSON.parse(request.rawBody);

        return true;
    }
    
    return false;
}


module.exports.json = function (){
    return function (request, response, next){
        json(request);

        next();
    };
};


function urlencoded(request){
    if (request.is('application/x-www-form-urlencoded')){
        request.body = querystring.parse(request.rawBody);
        
        return true;
    }
    
    return false;
}


module.exports.urlencoded = function (){
    return function (request, response, next){
        urlencoded(request);

        next();
    };
};


module.exports.bodyParser = function (){
    return function (request, response, next){
        if (json(request)){

        } else if (urlencoded(request)){

        }
        
        next();
    };
};