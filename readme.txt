1. A lot of work with RegExp, writing complex functions that works in an a-synchronous manner.
2. The API was definitive, it was nice implementing it. The result is really cool!
3.
    a.
    // will make many synchronous calls, slowing the server down significantly
    function (request, response, next){
        var k = 0;
        for (var i = 0; i < 1000000; ++i){
            for (var j = 0; j < 1000000; ++j){
                ++k;
            }
        }
        response.send(200);
    }

    b.
    // will create a significantly large amount of listeners on response object
    function (request, response, next){
        var k = 0;
        for (var i = 0; i < 1000000; ++i){
            for (var j = 0; j < 1000000; ++j){
                response.on('finish', function (){
                    ++k;
                });
            }
        }
        response.send(200);
    }

    Q: How would I make sure they're executed?
    A: If I hacked to server, i know it's ip address or it's domain name. If
       it's domain name is 'www.server.com', then all I have to do is call
       'www.server.com/hello/hacker', or I can write a simple script that gets
       this address multiple times.