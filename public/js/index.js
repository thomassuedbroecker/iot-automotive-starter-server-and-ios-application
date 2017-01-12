/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-AEGGZJ&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps%20%28Android-Mobile%20and%20Server-all%29
 *
 * You may not use this file except in compliance with the license.
 */
$(document).ready(function(){

  $('.selection-box').click(function() {
    $('.selection-box').removeClass('active');
    $(this).addClass('active');
    //Change the content from the selection box
    $('.instruction-box').addClass('hidden');
    $('.instruction-box[name=instruction-' + $(this).attr('name') + ']').removeClass('hidden');
    
    $("video").each(function(i, e) {e.pause();});
  });
});

// Setup the ajax indicator
$('body').append('<div id="ajaxBusy"><p><img src="images/loading.gif"></p></div>');

$('#ajaxBusy').css({
  display:"none",
  margin:"0px",
  paddingLeft:"0px",
  paddingRight:"0px",
  paddingTop:"0px",
  paddingBottom:"0px",
  position:"fixed",
  left:"50%",
  top:"50%",
  width:"auto"
});

// Ajax activity indicator bound to ajax start/stop document events
$(document).ajaxStart(function(){
  $('#ajaxBusy').show();
}).ajaxStop(function(){
  $('#ajaxBusy').hide();
});

//Scroll page control
$('.ibm-top-link').click(function() {
		$('html, body').animate({scrollTop : 0},400);
		return false;
});

$(window).scroll(function (event) {
    var scroll = $(window).scrollTop();
    var topLink = $('.ibm-top-link');
    if (scroll > 0){
      if(topLink.hasClass('hidden')){
        topLink.removeClass('hidden');
      }
    }
    else {
      if(!topLink.hasClass('hidden')){
        topLink.addClass('hidden');
      }
    }
});