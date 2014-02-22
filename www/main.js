function vanishDocument(){
	$('#headerContainer p').fadeOut('slow');
	$('#myPic').fadeOut('slow');
	$('#tableSection').fadeOut('slow');
	$('#footer').fadeOut('slow');
	$('#bottomSplitter').fadeOut('slow', function(){
        $('#calculator').fadeIn('slow');
    });
}


$(document).ready(function () {
    $('#submitButton').click(function () {
        if ($('#username').val() == 'admin' && $('#password').val() == 'admin'){
            vanishDocument();
        }
    });

    var calcUI = new Calculator(0, document.getElementById('calcDisplay'), document.getElementById('inputCalc'));
    calcUI.clear();

	$('#settingsBut').click(function () {
		$('#settingsChange').toggle('slow');
		$('#defaultVal').val(calcUI.defaultVal);
	});

	$('#settingsSubmit').click(function () {
        if (!isNaN($('#defaultVal').val())){
            calcUI.defaultVal = $('#defaultVal').val() * 1;
            $('#settingsChange').toggle('slow');
        }
		else{
            alert('Input must be a legal number!');
        }
	});

	$('#clearBut').click(calcUI.clear);

    $('#plusBut').click(calcUI.add);

    $('#multBut').click(calcUI.multiply);

    $('#inputCalc').keypress(function(e){
        if (e.keyCode < 48 || e.keyCode > 57)
        {
            alert('Only positive integers and zero are allowed!');
            return false;
        }
    });

    $('#defaultVal').keypress(function(e)
    {
        if ((e.keyCode < 48 || e.keyCode > 57) && e.keyCode != 45)
        {
            alert('Only digits and minus sign are allowed!');
            return false;
        }
    });
});