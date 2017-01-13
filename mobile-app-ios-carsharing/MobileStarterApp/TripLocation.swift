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
 
class TripLocation {
	var start_latitude : Double?
	var start_longitude : Double?
	var end_latitude : Double?
	var end_longitude : Double?
	var behaviors : [TripBehavior]?

    class func fromDictionary(_ array:NSArray) -> [TripLocation] {
        var returnArray:[TripLocation] = []
        for item in array {
            returnArray.append(TripLocation(dictionary: item as! NSDictionary))
        }
        return returnArray
    }

	init(dictionary: NSDictionary) {
		start_latitude = dictionary["start_latitude"] as? Double
		start_longitude = dictionary["start_longitude"] as? Double
		end_latitude = dictionary["end_latitude"] as? Double
		end_longitude = dictionary["end_longitude"] as? Double
		if (dictionary["behaviors"] != nil) {
            behaviors = TripBehavior.fromDictionary(dictionary["behaviors"] as! NSArray)
        }
	}
}
