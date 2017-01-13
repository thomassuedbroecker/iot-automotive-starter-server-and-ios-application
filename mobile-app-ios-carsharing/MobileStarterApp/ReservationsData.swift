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
 
class ReservationsData {
	var _id : String?
	var _rev : String?
	var type : String?
	var carId : String?
	var pickupTime : Double?
	var dropOffTime : Double?
    var actualPickupTime : Int?
    var userId : Int?
	var status : String?
	var carDetails : CarData?

    class func fromDictionary(_ array:NSArray) -> [ReservationsData] {
        var returnArray:[ReservationsData] = []
        for item in array {
            returnArray.append(ReservationsData(dictionary: item as! NSDictionary))
        }
        return returnArray
    }
    
    init(dictionary: NSDictionary) {
        _id = dictionary["_id"] as? String
        _rev = dictionary["_rev"] as? String
        type = dictionary["type"] as? String
        carId = dictionary["carId"] as? String
        pickupTime = Double((dictionary["pickupTime"] as? String)!)
        dropOffTime = Double((dictionary["dropOffTime"] as? String)!)
        if (dictionary["actualPickupTime"] != nil) {
            actualPickupTime = dictionary["actualPickupTime"] as? Int
        }
        userId = dictionary["userId"] as? Int
        status = dictionary["status"] as? String
        
        if (dictionary["carDetails"] != nil) {
            carDetails = CarData(dictionary: dictionary["carDetails"] as! NSDictionary)
        }
    }
}
