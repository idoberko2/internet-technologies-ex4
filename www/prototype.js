function A(){
}
A.prototype = null;

function B(){
}
B.prototype = new A();

function C(){
}
C.prototype = new B();

function D(){
}
D.prototype = new C();

var a = new A();
var b = new B();
var c = new C();
var d = new D();

