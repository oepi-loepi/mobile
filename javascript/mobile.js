//Various programStates
var PROG_MANUAL 			= 0;
var PROG_BASE 				= 1;
var PROG_TEMPOVERRIDE = 2;
var PROG_PROGOVERRIDE = 3;
var	PROG_HOLIDAY 			= 4;
var PROG_MANUALHOLIDAY= 5;
var PROG_AWAYNOW 			= 6;
var PROG_DAYOFF 			= 7;
var PROG_LOCKEDBASE 	= 8;

var STATE_RELAX 			= 0;
var STATE_ACTIVE 			= 1;
var STATE_SLEEP 			= 2;
var STATE_AWAY 				= 3;
var STATE_HOLIDAY			= 4;

var THERMOSTAT_STATES = "/hcb_config?action=getObjectConfigTree&package=happ_thermstat&internalAddress=thermostatStates";
var PWRUSAGE_INFO_URL = "/happ_pwrusage?action=GetCurrentUsage";
var THERMOSTAT_INFO_URL = "/happ_thermstat?action=getThermostatInfo";
var THERMOSTAT_CHANGE_SS_BASE_URL = "/happ_thermstat?action=changeSchemeState";
var SET_TARGET_TEMP_URLCTOR				= function(setpoint) { return "/happ_thermstat?action=roomSetpoint&Setpoint=" + setpoint; };
var thermstatInfoT = null;
var pwrusageInfoT = null;
var setTempT = null;

var userActive = false;

var activeState = -1;
var currentTemp = 0;
var currentSetpoint = 0;
var programState = 0;

function initPage()
{
	$.hcb.translatePage();
		
	//If we are local we don't need to login
	if(jQuery.hcb.proxy.supported == false)
	{
		$.mobile.changePage("#main");
	}
	else
	{
		$('#loginForm').on('submit', function (e) {
		var $this = $(this);
	
		//prevent the form from submitting normally
		e.preventDefault();
		$.mobile.showPageLoadingMsg();
		$.post($this.attr('action'), $this.serialize(), function (response) 
		{
			$.mobile.hidePageLoadingMsg();
			if(response.login)
			{
				jQuery.hcb.getLocale();
				jQuery.hcb.reinitTranslation
				
				$.mobile.changePage("#main");
			}
			else 
				alert(ts("Email address and/or password is incorrect. Please try again."));
			}, 'json');
		});
	}
}

function logout()
{
	clearTimeout(pwrusageInfoT);
	pwrusageInfoT = null;
	clearTimeout(setTempT);	
	setTempT = null;
	clearTimeout(thermstatInfoT);	
	thermstatInfoT = null;
	
	$.mobile.changePage("#login");
}

function login()
{	
	var url = '/servlet/forwarder/'
	var username=document.getElementById('username').value;
	var password=document.getElementById('password').value;
	alert(username + ' ' + password);
	
	$.mobile.changePage("#main");
}

function mainPageLoaded()
{
	getThermostatStates();
	getThermostatInfo()
}

function mainPageHidden()
{
	if(thermstatInfoT != null)
		clearTimeout(thermstatInfoT);
}

function usagePageLoaded()
{
	getPwrusageInfo();
}

function usagePageHidden()
{
	if(pwrusageInfoT != null)
		clearTimeout(pwrusageInfoT);
}

function setTempToDiv(divId, temp)
{
	if(!$("#"+divId))
		return;
		
	var setpB = parseInt(temp / 100);
	var setpS = (temp - (setpB*100) ) ? 5 : 0;
	$("#"+divId).html( setpB+ ","+setpS+"°");
}

function showFormattedIndoorTemp(temperature, setpoint)
{
	/*
	TSC change: round the actual temperature to one decimal 
	*/
	
	var tempInt = parseInt(temperature);
	var setpointInt = parseInt(setpoint);

	var high = parseInt(temperature.length == 4?temperature.substr( 0, 2):temperature.substr( 0, 1));
	var low10 = parseInt(temperature.length == 4?temperature.substr( 2, 1):temperature.substr( 1, 1));
	var low1 = parseInt(temperature.length == 4?temperature.substr( 3, 1):temperature.substr( 2, 1));
	if (low1 > 4)
	{
		low10++;
		if (low10 == 10)
		{
			low10 = 0;
			high++;	
		}
	}
	
	$("#cur_temp").html( high + ","+ low10 + "°");
	
	setTempToDiv("set_temp", setpoint);
}

function setActiveProgramState()
{
	//First set all inactive?
	for(var i=0; i<4; i++)
		$("#state_"+i).removeClass('ui-btn-sel');
	
	if( (activeState >= 0) &&  (activeState < 4))
		$("#state_"+activeState).addClass('ui-btn-sel');
		
	//Now do the locking :P
	switch(programState)
	{
		case PROG_MANUAL:
		case PROG_HOLIDAY:
		case PROG_MANUALHOLIDAY:
		{
			//Remove all lock info
			$("#modes").removeClass('program');
			for(var i=0; i<4; i++)
				$("#state_"+i).removeClass('lock');
				
			break;
		}
		case PROG_BASE:
		case PROG_TEMPOVERRIDE:
		case PROG_PROGOVERRIDE:
		{
			$("#modes").addClass('program');
			for(var i=0; i<4; i++)
				$("#state_"+i).removeClass('lock');
			break;
		}
		case PROG_LOCKEDBASE:
		{
			$("#modes").addClass('program');
			for(var i=0; i<4; i++)
				$("#state_"+i).addClass('lock');
			
			break;
		}
	}
}

function getStateName(stateId)
{
	switch(stateId)
	{
		case STATE_RELAX:
			return ts("Comfort");
		case STATE_ACTIVE:	
			return ts("At home");
		case STATE_SLEEP:	
			return ts("Sleeping");
		case STATE_AWAY:	
			return ts("Away");
		default:
			return "";
	}
}

function setProgramStateInfo(setpoint)
{
	setActiveProgramState();
	
	//Now the info line
	var lineInfo = "";
	var progName = getStateName(activeState);
	switch(programState)
	{
		case PROG_BASE:
			lineInfo = ts("follow_prog");
			break;
		case PROG_TEMPOVERRIDE:
		case PROG_PROGOVERRIDE:
		{
			if(progName == "")
				lineInfo = ts("weekly_override");
			else
				lineInfo = ts("weekly_override_fav", [progName]);
			break;
		}
		case PROG_HOLIDAY:
		case PROG_MANUALHOLIDAY:
			lineInfo = ts("Vacation");
			break;
		case PROG_MANUAL:
		case PROG_LOCKEDBASE:
		{
			if(progName == "")
				lineInfo = ts("Permanent");
			else
				lineInfo = ts("Permanent_fav", [progName]);
			break;
		}
		default:
			lineInfo = ""; //Don't know what state this is!
	}
	$("#info_line").html(lineInfo);
	
	//Do not set setpoint when user is settings them!
	if(userActive == true)
		return;
		
	currentSetpoint = parseInt(setpoint);
	showFormattedIndoorTemp(currentTemp, currentSetpoint);
}

function setBurnerInfo(newState, otCommError, errorFound)
{
	$("#flame").removeClass('on tap error');
	if(otCommError == "1")
	{
		$("#flame").addClass('error');
		
		$("#error_line").html(ts("ot_comm_err"));
		$("#error_line").show();
		$("#info_line").hide();
	}
	else if( (errorFound != "0") && (errorFound != "255"))
	{
		$("#flame").addClass('error');
		
		//Have an CH error.
		$("#error_line").html(ts("error_found_err", [errorFound]));
		$("#error_line").show();
		$("#info_line").hide();
	}
	else
	{	
		$("#error_line").hide();
		$("#info_line").show();
		if(newState == "1")
		{
			$("#flame").addClass('on');
		}
		else if(newState == "2")
		{
			$("#flame").addClass('tap');
		}
	}
}

function handleThermostatInfo(data)
{
	thermstatInfoT = null;
	if(data && (data.result == "ok"))
	{
		programState = parseInt(data.programState);
		activeState = parseInt(data.activeState);
		currentTemp = data.currentTemp;
		
		//TODO: Do we wan't to do anything with errorCode?
		setBurnerInfo(data.burnerInfo, data.otCommError, data.errorFound);
			
		setProgramStateInfo(data.currentSetpoint);
		thermstatInfoT = setTimeout("getThermostatInfo()", 10000);
	}
	else
	{
		//Error occurred. Return to login page?
//		console.debug("Error occurred. Return to login page?");
	}
}

function setProgramState(pState)
{
	console.debug("setProgramState "+pState);	
	if (programState == PROG_LOCKEDBASE)
	{
		//Always unlock when new state is chosen
		changeSchemeState(PROG_TEMPOVERRIDE, pState);
	}
	else if (programState == PROG_MANUAL)
	{
		changeSchemeState(PROG_MANUAL, pState);
	}
	else
	{
		if (activeState == pState)
		{
//			console.debug("SECONDS PRESS. LOCK");
			changeSchemeState(PROG_LOCKEDBASE, pState);
		}
		else
		{
//			console.debug("FIRST");
			changeSchemeState(PROG_TEMPOVERRIDE, pState);
		}
	}
	activeState = pState;
	setActiveProgramState();
}

function getThermostatInfo()
{
	if(thermstatInfoT != null)
		clearTimeout(thermstatInfoT);

	$.getJSON( THERMOSTAT_INFO_URL, handleThermostatInfo);
}

function changeSchemeState(newState, newSetPointState)
{
	var fullUrl = THERMOSTAT_CHANGE_SS_BASE_URL + "&state="+newState+"&temperatureState="+newSetPointState;
	
	$.getJSON( fullUrl, getThermostatInfo);
}

function sendTempInvoke()
{
	userActive = false;
	
	$.getJSON( SET_TARGET_TEMP_URLCTOR(currentSetpoint), getThermostatInfo);
}

function changeTemp(changeVal)	
{
	userActive = true;
	clearTimeout(setTempT);
	setTempT = setTimeout("sendTempInvoke()",2000);

	currentSetpoint += parseInt(changeVal);	
	
	if(currentSetpoint < 600)
		currentSetpoint = 600;
	if(currentSetpoint > 3000)
		currentSetpoint = 3000;	

	setTempToDiv("cur_temp", currentSetpoint);
}

var inActiveColor = "#EDEDED";
var colorArray = ["#90bd29", "#adc21b", "#cdc21c", "#eac21e", "#fdc221", "#ffb026", "#fa8a2d", "#ec5e35", "#dd353c", "#d6264e"];

function fillBlockBar(uType, blocksActive)
{
	var i;
	for(i=0; i<10; i++)
	{
		if(blocksActive > i)
			$("#"+uType+"_block-"+i).css("background-color", colorArray[i]);
		else
			$("#"+uType+"_block-"+i).css("background-color", inActiveColor);
	}
}

function setUsageInfo(uType, uValue, avgValue)
{
	if(uValue)
	{
		$("#cur_"+uType).html(uValue);
		//Avg is 3 blocks
		var blockStep = avgValue / 3;
		var blocksActive = Math.round(uValue / blockStep);
		fillBlockBar(uType, blocksActive);
	}
	else
	{
		$("#cur_"+uType).html("-");
		fillBlockBar(uType, 0);
	}
}

function handlePwrusageInfo(data)
{
	if(data && (data.result == "ok"))
	{
		if(data.powerUsage)
			setUsageInfo("power", data.powerUsage.value, data.powerUsage.avgValue);
		if(data.gasUsage)
			setUsageInfo("gas", data.gasUsage.value, data.gasUsage.avgValue);
		
		pwrusageInfoT = setTimeout("getPwrusageInfo()", 10000);
	}
	else
	{
		//Error occurred. Return to login page?
//		console.debug("Error occurred. Return to login page?");
	}
}

function getPwrusageInfo()
{
	if(pwrusageInfoT != null)
		clearTimeout(pwrusageInfoT);

	$.getJSON( PWRUSAGE_INFO_URL, handlePwrusageInfo);
	
}

function handleThermostatStates(data)
{
	if(data)
	{
		if(data.result != "error")
		{
			var sts = data.states[0].state;
			for(var elm in sts)
			{
				var state = sts[elm];
				setTempToDiv("modeTemp-"+state.id, state.tempValue);
			}
		}
	}
}

function getThermostatStates()
{
	$.getJSON( THERMOSTAT_STATES, handleThermostatStates);
}