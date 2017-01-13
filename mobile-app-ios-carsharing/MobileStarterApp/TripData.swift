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

class TripData {
    var score : Double?
    var trip_id : String?
	var trip_uuid : String?
	var mo_id : String?
	var start_time : Double?
	var end_time : Double?
    var start_altitude : Int?
    var end_altitude : Int?
    var start_latitude : Double?
    var end_latitude : Double?
    var start_longitude : Double?
    var end_longitude : Double?
    var duration: Double?

    class func fromDictionary(array:NSArray) -> [TripData] {
        var returnArray:[TripData] = []
        for item in array {
            returnArray.append(TripData(dictionary: item as! NSDictionary))
        }
        return returnArray
    }

	init(dictionary: NSDictionary) {
        score = dictionary["score"] as? Double
        trip_id = dictionary["trip_id"] as? String
		trip_uuid = dictionary["trip_uuid"] as? String
		mo_id = dictionary["mo_id"] as? String
		start_time = dictionary["start_time"] as? Double
		end_time = dictionary["end_time"] as? Double
        start_altitude = dictionary["start_altitude"] as? Int
        end_altitude = dictionary["end_altitude"] as? Int
        start_latitude = dictionary["start_latitude"] as? Double
        end_latitude = dictionary["end_latitude"] as? Double
        start_longitude = dictionary["start_longitude"] as? Double
        end_longitude = dictionary["end_longitude"] as? Double
        if let _ = start_time {
            if let _ = end_time {
                duration = end_time! - start_time!
            }
        }
	}
}
