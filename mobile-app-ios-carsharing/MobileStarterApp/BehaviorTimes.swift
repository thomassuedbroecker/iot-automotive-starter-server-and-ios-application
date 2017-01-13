/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-ADRVKF&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps
 *
 * You may not use this file except in compliance with the license.
 */
import Foundation
 
class BehaviorTimes {
    var freqStop: [BehaviorDuration]?
    var harshBrake: [BehaviorDuration]?
    var overSpeed: [BehaviorDuration]?
    var freqAcceleration: [BehaviorDuration]?
    var anxiousAcceleration: [BehaviorDuration]?
    var freqBrake: [BehaviorDuration]?
    var tiredDriving: [BehaviorDuration]?
    var accBefTurn: [BehaviorDuration]?
    var brakeOutTurn: [BehaviorDuration]?
    var sharpTurn: [BehaviorDuration]?

    class func fromDictionary(_ array:NSArray) -> [BehaviorTimes] {
        var returnArray:[BehaviorTimes] = []
        for item in array {
            returnArray.append(BehaviorTimes(dictionary: item as! NSDictionary))
        }
        return returnArray
    }

	init(dictionary: NSDictionary) {
        if (dictionary["FreqStop"] != nil) {
            freqStop = BehaviorDuration.fromDictionary(dictionary["FreqStop"] as! NSArray)
        }
        if (dictionary["HarshBrake"] != nil) {
            harshBrake = BehaviorDuration.fromDictionary(dictionary["HarshBrake"] as! NSArray)
        }
        if (dictionary["OverSpeed"] != nil) {
            overSpeed = BehaviorDuration.fromDictionary(dictionary["OverSpeed"] as! NSArray)
        }
        if (dictionary["FreqAcceleration"] != nil) {
            freqAcceleration = BehaviorDuration.fromDictionary(dictionary["FreqAcceleration"] as! NSArray)
        }
        if (dictionary["AnxiousAcceleration"] != nil) {
            anxiousAcceleration = BehaviorDuration.fromDictionary(dictionary["AnxiousAcceleration"] as! NSArray)
        }
        if (dictionary["FreqBrake"] != nil) {
            freqBrake = BehaviorDuration.fromDictionary(dictionary["FreqBrake"] as! NSArray)
        }
        if (dictionary["TiredDriving"] != nil) {
            tiredDriving = BehaviorDuration.fromDictionary(dictionary["TiredDriving"] as! NSArray)
        }
        if (dictionary["AccBefTurn"] != nil) {
            accBefTurn = BehaviorDuration.fromDictionary(dictionary["AccBefTurn"] as! NSArray)
        }
        if (dictionary["BrakeOutTurn"] != nil) {
            brakeOutTurn = BehaviorDuration.fromDictionary(dictionary["BrakeOutTurn"] as! NSArray)
        }
        if (dictionary["SharpTurn"] != nil) {
            sharpTurn = BehaviorDuration.fromDictionary(dictionary["SharpTurn"] as! NSArray)
        }
	}
}
