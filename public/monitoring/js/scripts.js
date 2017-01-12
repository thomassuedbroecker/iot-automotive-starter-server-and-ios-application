/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-AEGGZJ&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps%20%28Android-Mobile%20and%20Server-all%29
 *
 * You may not use this file except in compliance with the license.
 */
var modalCalls = document.querySelectorAll('.em-Modal-Call');
var modalCallsArray = Array.prototype.slice.call(modalCalls, 0);

modalCallsArray.forEach(function(el) {
    if (document.getElementById(el.rel)) {
        el.onclick=function(e){
            e.preventDefault();

            document.getElementById(el.rel).classList.add('em-Modal-show');
            document.getElementById(el.rel).querySelector('.em-Modal-Content').classList.add('em-Modal-Content-show');
            document.getElementById(el.rel).querySelector('.em-Modal-Close').classList.add('em-Modal-Close-show');

            var close = function(event) {
                if (event) {
                    event.preventDefault();
                }

                document.getElementById(el.rel).querySelector('.em-Modal-Close').classList.remove('em-Modal-Close-show');
                document.getElementById(el.rel).classList.remove('em-Modal-show');
                document.getElementById(el.rel).querySelector('.em-Modal-Content').classList.remove('em-Modal-Content-show');
                
                document.querySelector('header').classList.remove('blur');
                document.querySelector('.content').classList.remove('blur');
            };

            document.onkeydown = function(event) {
                event = event || window.event;
                if (event.keyCode == 27) {
                    close();
                }
            };

            document.getElementById(el.rel).querySelector('.em-Modal-Content .em-Modal-Close').addEventListener("click", close);
            
            Array.prototype.slice.call(document.querySelectorAll('.em-Modal-Content ul.modalMenu a'), 0).forEach(function(modalLink) {
                modalLink.addEventListener("click", close);
            });
            
            document.querySelector('header').classList.add('blur');
            document.querySelector('.content').classList.add('blur');
        };
    }
});