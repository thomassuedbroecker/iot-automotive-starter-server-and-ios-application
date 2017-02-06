//
//  TextToSpeechREST.swift
//  MobileStarterApp
//
//  Created by IBM Thomas Suedbroecker on 06.02.17.
//  Copyright © 2017 IBM. All rights reserved.
//
// Plan to implement http://stackoverflow.com/questions/24379601/how-to-make-an-http-request-basic-auth-in-swift
import Foundation


class TextToSpeechREST {
 func getSpeech( text : String ) -> String {
    // set up the base64-encoded credentials
    let username = "user"
    let password = "pass"
    let loginString = NSString(format: "%@:%@", username, password)
    let loginData: NSData = loginString.dataUsingEncoding(NSUTF8StringEncoding)!
    let base64LoginString = loginData.base64EncodedStringWithOptions([])
    
    // create the request
    let url = NSURL(string: "https://stream.watsonplatform.net/text-to-speech/api/v1/synthesize")
    let request = NSMutableURLRequest(URL: url!)
    
    request.HTTPMethod = "POST"
    request.setValue("Basic \(base64LoginString)", forHTTPHeaderField: "Authorization")
    
    // fire off the request
    // make sure your class conforms to NSURLConnectionDelegate
    let urlConnection = NSURLConnection(request: request, delegate : self)
    urlConnection!.start()
    
    /* TODO: Implement TextToSpeech
    NSURLConnection.sendAsynchronousRequest(request, queue: NSOperationQueue.mainQueue()) {(response, data, error) in
        println(NSString(data: data, encoding: NSUTF8StringEncoding))
    }
    */
    return text
 }
}
