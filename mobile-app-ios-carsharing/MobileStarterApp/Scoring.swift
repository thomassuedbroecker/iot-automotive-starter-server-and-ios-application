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
 
class Scoring {
    
    let freqStop_key = "Frequent stops"
    let harshBrake_key = "Harsh braking"
    let overSpeed_key = "Speeding"
    let freqAcceleration_key = "Frequent acceleration"
    let anxiousAcceleration_key = "Harsh acceleration"
    let freqBrake_key = "Frequent braking"
    let tiredDriving_key = "Fatigued driving"
    let accBefTurn_key = "Acceleration before turn"
    let brakeOutTurn_key = "Over-braking before exiting turn"
    let sharpTurn_key = "Sharp turn"
    
    
	var totalTime : Int?
	var score : Double?
	var freqStop : ScoringBehavior?
	var harshBrake : ScoringBehavior?
	var overSpeed : ScoringBehavior?
	var freqAcceleration : ScoringBehavior?
	var anxiousAcceleration : ScoringBehavior?
	var freqBrake : ScoringBehavior?
    var tiredDriving : ScoringBehavior?
    var accBefTurn : ScoringBehavior?
    var brakeOutTurn : ScoringBehavior?
    var sharpTurn : ScoringBehavior?

    class func fromDictionary(_ array:NSArray) -> [Scoring] {
        var returnArray:[Scoring] = []
        for item in array {
            returnArray.append(Scoring(dictionary: item as! NSDictionary))
        }
        return returnArray
    }

	init(dictionary: NSDictionary) {
		totalTime = dictionary["totalTime"] as? Int
		score = dictionary["score"] as? Double
		if (dictionary[freqStop_key] != nil) {
            freqStop = ScoringBehavior(dictionary: dictionary[freqStop_key] as! NSDictionary, name: freqStop_key)
        }
		if (dictionary[harshBrake_key] != nil) {
            harshBrake = ScoringBehavior(dictionary: dictionary[harshBrake_key] as! NSDictionary, name: harshBrake_key)
        }
		if (dictionary[overSpeed_key] != nil) {
            overSpeed = ScoringBehavior(dictionary: dictionary[overSpeed_key] as! NSDictionary, name: overSpeed_key)
        }
		if (dictionary[freqAcceleration_key] != nil) {
            freqAcceleration = ScoringBehavior(dictionary: dictionary[freqAcceleration_key] as! NSDictionary, name: freqAcceleration_key)
        }
		if (dictionary[anxiousAcceleration_key] != nil) {
            anxiousAcceleration = ScoringBehavior(dictionary: dictionary[anxiousAcceleration_key] as! NSDictionary, name: anxiousAcceleration_key)
        }
		if (dictionary[freqBrake_key] != nil) {
            freqBrake = ScoringBehavior(dictionary: dictionary[freqBrake_key] as! NSDictionary, name: freqBrake_key)
        }
		if (dictionary[tiredDriving_key] != nil) {
            tiredDriving = ScoringBehavior(dictionary: dictionary[tiredDriving_key] as! NSDictionary, name: tiredDriving_key)
        }
		if (dictionary[accBefTurn_key] != nil) {
            accBefTurn = ScoringBehavior(dictionary: dictionary[accBefTurn_key] as! NSDictionary, name: accBefTurn_key)
        }
		if (dictionary[brakeOutTurn_key] != nil) {
            brakeOutTurn = ScoringBehavior(dictionary: dictionary[brakeOutTurn_key] as! NSDictionary, name: brakeOutTurn_key)
        }
		if (dictionary[sharpTurn_key] != nil) {
            sharpTurn = ScoringBehavior(dictionary: dictionary[sharpTurn_key] as! NSDictionary, name: sharpTurn_key)
        }
	}
    
    func getScoringBehaviors() -> [ScoringBehavior] {
        var returnArray: [ScoringBehavior] = []
        if let _ = self.accBefTurn {
            returnArray.append(self.accBefTurn!)
        }
        if let _ = self.anxiousAcceleration {
            returnArray.append(self.anxiousAcceleration!)
        }
        if let _ = self.brakeOutTurn {
            returnArray.append(self.brakeOutTurn!)
        }
        if let _ = self.freqAcceleration {
            returnArray.append(self.freqAcceleration!)
        }
        if let _ = self.freqBrake {
            returnArray.append(self.freqBrake!)
        }
        if let _ = self.freqStop {
            returnArray.append(self.freqStop!)
        }
        if let _ = self.harshBrake {
            returnArray.append(self.harshBrake!)
        }
        if let _ = self.overSpeed {
            returnArray.append(self.overSpeed!)
        }
        if let _ = self.sharpTurn {
            returnArray.append(self.sharpTurn!)
        }
        if let _ = self.tiredDriving {
            returnArray.append(self.tiredDriving!)
        }
        return returnArray
    }
}
