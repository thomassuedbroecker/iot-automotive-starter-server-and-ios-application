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
 
class Trip {
	var start_time : Double?
	var end_time : Double?
	var start_latitude : Double?
	var start_longitude : Double?
	var end_latitude : Double?
	var end_longitude : Double?
	var behaviorTimes : BehaviorTimes?
	var scoring : Scoring?
	var locations : [TripLocation]?

    class func fromDictionary(array:NSArray) -> [Trip] {
        var returnArrary:[Trip] = []
        for item in array {
            returnArrary.append(Trip(dictionary: item as! NSDictionary))
        }
        return returnArrary
    }

	init(dictionary: NSDictionary) {
		start_time = dictionary["start_time"] as? Double
		end_time = dictionary["end_time"] as? Double
		start_latitude = dictionary["start_latitude"] as? Double
		start_longitude = dictionary["start_longitude"] as? Double
		end_latitude = dictionary["end_latitude"] as? Double
		end_longitude = dictionary["end_longitude"] as? Double
		if (dictionary["behaviors"] != nil) {
           behaviorTimes = BehaviorTimes(dictionary: dictionary["behaviors"] as! NSDictionary)
        }
		if (dictionary["scoring"] != nil) {
           scoring = Scoring(dictionary: dictionary["scoring"] as! NSDictionary)
        }
		if (dictionary["locations"] != nil) {
           locations = TripLocation.fromDictionary(dictionary["locations"] as! NSArray)
        }
	}
}