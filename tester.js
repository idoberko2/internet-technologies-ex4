var http = require('http');
var fs = require('fs');

var express = require('./miniExpress');
var miniHttp = require('./miniHttp');


var TEST_PORT = [8080, 8081, 8082, 8083];
var TEST_OPTIONS = [];
var TEST_STATUS = [];

var TEST_PARAMS = {
    t1: '1',
    t2: '2',
    t3: '3',
    jsonBody: JSON.stringify({x: '0'})
};
TEST_PARAMS.urlencodedBody = 't1=' + TEST_PARAMS.t1 + '&t2=' + TEST_PARAMS.t2;

TEST_OPTIONS = [{
    path: '/static',
    port: TEST_PORT[0]
}, {
    path: '/static/',
    port: TEST_PORT[0]
}, {
    path: '/stat',
    port: TEST_PORT[0]
}, {
    path: '/static',
    port: TEST_PORT[1]
}, {
    reqOptions: {
        hostname: 'localhost',
        port: TEST_PORT[2],
        method: 'PUT',
        path: '/test/' + TEST_PARAMS.t1 + '/' + TEST_PARAMS.t2,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': TEST_PARAMS.jsonBody.length
        }
    }
}, {
    reqOptions: {
        hostname: 'localhost',
        port: TEST_PORT[2],
        method: 'PUT',
        path: '/test/',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': TEST_PARAMS.urlencodedBody.length
        }
    }
}, {
    reqOptions: {
        hostname: 'localhost',
        port: TEST_PORT[3],
        method: 'GET',
        path: '/cookieTest',
        headers: {}
    }
}];

var CLIENT_COOKIES = {};
var COOKIES_TO_SET = {
    'name1': 'mush',
    'name2': 'shputz'
};


var APPS = [];
var SERVER;

function getAndCompare(optionsIndex, file){
    http.get(TEST_OPTIONS[optionsIndex], function (response){
        var responseBody = '';

        response.on('data', function (chunk) {
            responseBody += chunk;
        });

        response.on('end', function (){
            fs.readFile(__dirname + file,
                function(err, data){
                    TEST_STATUS.push(response.statusCode === 200 &&
                        data.toString() === responseBody.toString());
                });
        });
    });
}

function getCompareStatus(optionsIndex, statusCode){
    http.get(TEST_OPTIONS[optionsIndex], function (response){
        TEST_STATUS.push(response.statusCode === statusCode);
    });
}

APPS.push(express());
APPS[0].use('/static', express.static(__dirname + '\\static'));
APPS[0].listen(TEST_PORT[0], function (){
    console.log('listening on port ' + TEST_PORT[0]);

    // static request for /static
    getAndCompare(0, '\\static\\index.html');
    // static request for /static/
    getAndCompare(1, '\\static\\index.html');
    // static request for /stat
    getCompareStatus(2, 404);

    APPS[0].listen(TEST_PORT[1], function (){
        console.log('listening on port ' + TEST_PORT[1]);
        // static request using second port
        getAndCompare(3, '\\static\\index.html');
        // server should still listen on first port
        getAndCompare(0, '\\static\\index.html');
    });
});


setTimeout(function (){
    APPS.push(express());

    APPS[1].use(express.bodyParser());

    APPS[1].put(function (request, response, next){
        // testing call with no resource argument and next()
        request.params = {};
        request.params.t3 = TEST_PARAMS.t3;
        next();
    });

    APPS[1].put('/test/:t1/:t2', function (request, response){
        // result of prev test
        TEST_STATUS.push(request.params.t3 === TEST_PARAMS.t3);

        // testing parameters and json
        TEST_STATUS.push(request.params.t1 === TEST_PARAMS.t1 && request.params.t2 === TEST_PARAMS.t2 && JSON.stringify(request.body) === TEST_PARAMS.jsonBody);
    });

    APPS[1].put('/test', function (request, response) {
        // testing urlencoded
        TEST_STATUS.push(request.body.t1 === TEST_PARAMS.t1 && request.body.t2 === TEST_PARAMS.t2);
    });
    SERVER = miniHttp.createServer(APPS[1]);
    SERVER.listen(TEST_PORT[2], function (){
        console.log('listening on port ' + TEST_PORT[2]);
        var req = http.request(TEST_OPTIONS[4].reqOptions);
        req.write(TEST_PARAMS.jsonBody);
        req.end();

        req.on('error', function (err){
            console.log('error ' + err.message);
        });

        var req2 = http.request(TEST_OPTIONS[5].reqOptions);
        req2.write(TEST_PARAMS.urlencodedBody);
        req2.end();
        req2.on('error', function (err){
            console.log('error' + err.message);
        });
    });
}, 200);

function extractCookies(response){
    if (response.headers['set-cookie'] === undefined){
        return;
    }
//    console.log(response.headers['set-cookie']);
    for (var i = 0; i < response.headers['set-cookie'].length; ++i){
        var match = /(.*)\=(.*)/.exec(response.headers['set-cookie'][i]);
        CLIENT_COOKIES[match[1]] = match[2];
    }
}

function getCookieStr(){
    var cookiesStr = '';

    for (var name in CLIENT_COOKIES){
        cookiesStr += name + '=' + CLIENT_COOKIES[name] + '; ';
    }
    cookiesStr = cookiesStr.substr(0, cookiesStr.length - 2);

    return cookiesStr;
}

// set new cookies and send existing ones
function handleClientCookies(response, options){
    extractCookies(response);
    options.headers['Cookie'] = getCookieStr();
}

// testing cookieParser
setTimeout(function (){
    APPS.push(express());

    APPS[2].use(express.cookieParser());

    APPS[2].get('/cookieTest', function (request, response, next){
        if (request.cookies.name1 === undefined){
            response.cookie('name1', COOKIES_TO_SET.name1);
        } else if (request.cookies.name1 !== undefined && request.cookies.name2 === undefined){
            response.cookie('name2', COOKIES_TO_SET.name2);
        } else {
            TEST_STATUS.push(request.cookies.name1 === COOKIES_TO_SET.name1);
            TEST_STATUS.push(request.cookies.name2 === COOKIES_TO_SET.name2);
        }

        response.send(200);
    });

    APPS[2].listen(TEST_PORT[3], function (){
        http.get(TEST_OPTIONS[6].reqOptions, function (response){
            handleClientCookies(response, TEST_OPTIONS[6].reqOptions);

            http.get(TEST_OPTIONS[6].reqOptions, function (response2){
                handleClientCookies(response2, TEST_OPTIONS[6].reqOptions);
                http.get(TEST_OPTIONS[6].reqOptions, function (response3){

                });
            });
        });
    });
}, 400);

setTimeout(function (){
    for (var i = 0; i < TEST_STATUS.length; ++i){
        if (!TEST_STATUS[i]){
            console.log('At least one test has failed...');
            break;
        }
    }
    console.log('All good!');
}, 1000);
