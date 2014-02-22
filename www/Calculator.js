function Calculator(defaultVal, displayElement, inputElement){
    var that = this;

    that.defaultVal = defaultVal;
    that.displayElement = displayElement;
    that.inputElement = inputElement;

    var curValue = defaultVal;

    that.clear = function(){
        curValue = that.defaultVal;
        $(that.displayElement).html(curValue);
        $(that.inputElement).val('');
    };

    that.add = function(){
        curValue += $(that.inputElement).val() * 1;
        $(that.displayElement).html(curValue);
    };

    that.multiply = function(){
        curValue *= $(that.inputElement).val() * 1;
        $(that.displayElement).html(curValue);
    };
}

//Calculator.prototype.clear = function()
//{
////    alert(this);
//    this.setCurValue(this.defaultVal);
//    $(this.displayElement).html(this.getCurValue());
//    $(this.inputElement).val('');
//}
//
//Calculator.prototype.add = function()
//{
//    this.setCurValue(this.getCurValue() + ($(this.inputElement).val() * 1));
//    $(this.displayElement).html(this.getCurValue());
//}
//
//Calculator.prototype.multiply = function()
//{
//    this.setCurValue(this.getCurValue() * ($(this.inputElement).val() * 1));
//    $(this.displayElement).html(this.getCurValue());
//}