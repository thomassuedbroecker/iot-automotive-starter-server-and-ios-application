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

class Path {
    var coordinates : [NSArray]?
    
    class func fromDictionary(_ array:NSArray) -> [Path] {
        var returnArray:[Path] = []
        for item in array {
            if let features = item["features"] as? [NSDictionary] {
                let geometry = features[0]["geometry"] as? NSDictionary
                returnArray.append(Path(dictionary: geometry!))
            }
        }
        return returnArray
    }
    
    init(dictionary: NSDictionary) {
        coordinates = dictionary["coordinates"] as? [NSArray]
    }
}
