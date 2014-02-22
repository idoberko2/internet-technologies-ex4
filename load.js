var http = require('http');
var fs = require('fs');

var express = require('./miniExpress');

// load test parameters
var TEST_PORT = 8080;
var FILES = ['features.txt', 'prototype.js', 'main.js'];
var EACH_FILE_REPETITION = 3333;
var SUCCESS = true;
var SENT = 0;
var TIME_TO_WAIT = 10000;


// miniExpress initialization
var app = express();
app.use(express.static(__dirname + '\\www'));
app.listen(TEST_PORT);


// running simultaneous calls
for (var i = 0; i < FILES.length; ++i){
    (function (index){
        fs.readFile(__dirname + '\\www\\' + FILES[index], 'utf-8',
            function (err, data) {
                if (!err){
                    var comparisonFile = data;

                    for (var j = 0; j < EACH_FILE_REPETITION; ++j){
                        http.get({
                            port: TEST_PORT,
                            path: '/' + FILES[index]
                        }, function (response){
                            var responseBody = '';

                            response.on('data', function (chunk) {
                                responseBody += chunk;
                            });

                            response.on('end', function (){
                                SUCCESS = SUCCESS &&
                                    (responseBody === comparisonFile);
                                ++SENT;
                            });
                        });
                    }
                }
            });
    })(i);
}


// verify results
setTimeout(function (){
    if (SUCCESS){
        console.log('Load test successful! ' + SENT + ' requests sent and' +
            ' answered.');
    } else {
        console.log('At least one test has failed...');
    }
}, TIME_TO_WAIT);