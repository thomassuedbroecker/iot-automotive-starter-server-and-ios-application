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
 
class BehaviorDuration {
	var start_time : UInt64?
	var end_time : UInt64?

    class func fromDictionary(array:NSArray) -> [BehaviorDuration] {
        var returnArray:[BehaviorDuration] = []
        for item in array {
            returnArray.append(BehaviorDuration(dictionary: item as! NSDictionary))
        }
        return returnArray
    }

	init(dictionary: NSDictionary) {
		start_time = dictionary["start_time"] as? UInt64
		end_time = dictionary["end_time"] as? UInt64
	}
}