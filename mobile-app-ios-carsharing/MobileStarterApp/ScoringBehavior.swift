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

class ScoringBehavior {
	var score : Double?
	var totalTime : Int?
	var count : Int?
    var name : String?

    class func fromDictionary(_ array:NSArray, name: String) -> [ScoringBehavior] {
        var returnArray:[ScoringBehavior] = []
        for item in array {
            returnArray.append(ScoringBehavior(dictionary: item as! NSDictionary, name: name))
        }
        return returnArray
    }

    init(dictionary: NSDictionary, name: String) {
		score = dictionary["score"] as? Double
		totalTime = dictionary["totalTime"] as? Int
		count = dictionary["count"] as? Int
        self.name = name
	}
}
