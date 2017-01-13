/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-ADRVKF&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps
 *
 * You may not use this file except in compliance with the license.
 */
import CoreLocation
import UIKit
import BMSCore
import BMSSecurity

let USER_DEFAULTS_KEY_APP_ROUTE = "appRoute"
let USER_DEFAULTS_KEY_PUSH_APP_GUID = "pushAppGuid"
let USER_DEFAULTS_KEY_PUSH_CLIENT_SECRET = "pushClientSecret"
let USER_DEFAULTS_KEY_MCA_TENANT_ID = "mcaTenantId"

struct API {
    static var moveToRootOnError = true
    //static let defaultAppURL = "https://iot-automotive-starter-tsuedbro.eu-gb.mybluemix.net"
    static let defaultPushAppGUID = ""
    static let defaultPushClientSecret = ""
    static let defaultMcaTenantId = ""
    static var bmRegion = BMSClient.Region.usSouth
    static var customRealm = "custauth"

    static var connectedAppURL = defaultAppURL
    static var connectedPushAppGUID = defaultPushAppGUID
    static var connectedPushClientSecret = defaultPushClientSecret
    static var connectedMcaTenantId = defaultMcaTenantId
    
    static var carsNearby = "\(connectedAppURL)/user/carsnearby"
    static var reservation = "\(connectedAppURL)/user/reservation"
    static var reservations = "\(connectedAppURL)/user/activeReservations"
    static var carControl = "\(connectedAppURL)/user/carControl"
    static var driverStats = "\(connectedAppURL)/user/driverInsights/statistics"
    static var trips = "\(connectedAppURL)/user/driverInsights"
    static var tripBehavior = "\(connectedAppURL)/user/driverInsights/behaviors"
    static var latestTripBehavior = "\(connectedAppURL)/user/driverInsights/behaviors/latest"
    static var tripRoutes = "\(connectedAppURL)/user/triproutes"
    static var tripAnalysisStatus = "\(connectedAppURL)/user/driverInsights/tripanalysisstatus"
    static var credentials = "\(connectedAppURL)/user/device/credentials"

    static func setURIs(_ appURL: String) {
        carsNearby = "\(appURL)/user/carsnearby"
        reservation = "\(appURL)/user/reservation"
        reservations = "\(appURL)/user/activeReservations"
        carControl = "\(appURL)/user/carControl"
        driverStats = "\(appURL)/user/driverInsights/statistics"
        trips = "\(appURL)/user/driverInsights"
        tripBehavior = "\(appURL)/user/driverInsights/behaviors"
        latestTripBehavior = "\(appURL)/user/driverInsights/behaviors/latest"
        tripRoutes = "\(appURL)/user/triproutes"
        tripAnalysisStatus = "\(appURL)/user/driverInsights/tripanalysisstatus"
        credentials = "\(appURL)/user/device/credentials"
    }

    static func setDefaultServer () {
        connectedAppURL = defaultAppURL
        connectedPushAppGUID = defaultPushAppGUID
        connectedPushClientSecret = defaultPushClientSecret
        connectedMcaTenantId = defaultMcaTenantId
        moveToRootOnError = true
        setURIs(connectedAppURL)
    }

    static func delegateCustomAuthHandler() -> Void {
        let delegate = CustomAuthDelegate()
        let mcaAuthManager = MCAAuthorizationManager.sharedInstance
        
        do {
            try mcaAuthManager.registerAuthenticationDelegate(delegate, realm: customRealm)
            print("CustomeAuthDelegate was registered")
        } catch {
            print("error with register: \(error)")
        }
        return
    }

    static func doInitialize() {
        let userDefaults = UserDefaults.standard
        let appRoute = userDefaults.value(forKey: USER_DEFAULTS_KEY_APP_ROUTE) as? String
        let pushAppGUID = userDefaults.value(forKey: USER_DEFAULTS_KEY_PUSH_APP_GUID) as? String
        let pushClientSecret = userDefaults.value(forKey: USER_DEFAULTS_KEY_PUSH_CLIENT_SECRET) as? String
        let mcaTenantId = userDefaults.value(forKey: USER_DEFAULTS_KEY_MCA_TENANT_ID) as? String
        moveToRootOnError = true
        if(appRoute != nil){
            connectedAppURL = appRoute!
            connectedPushAppGUID = pushAppGUID == nil ? "" : pushAppGUID!
            connectedPushClientSecret = pushClientSecret == nil ? "" : pushClientSecret!
            connectedMcaTenantId = mcaTenantId == nil ? "" : mcaTenantId!
            setURIs(connectedAppURL)
        }
        if connectedMcaTenantId != "" {
            print("initialize and set up MCA")
            let mcaAuthManager = MCAAuthorizationManager.sharedInstance
            mcaAuthManager.initialize(tenantId: connectedMcaTenantId, bluemixRegion: bmRegion)
            BMSClient.sharedInstance.authorizationManager = mcaAuthManager
            delegateCustomAuthHandler()
            // uncomment the next line if make that login is always necessary after restart this application
            // MCAAuthorizationManager.sharedInstance.logout(nil)
        } else {
            print("non-MCA server")
        }
    }
    
    static func login(_ requestAfterLogin: NSMutableURLRequest?, callback: ((HTTPURLResponse, [NSDictionary]) -> Void)?){
        let customResourceURL = BMSClient.sharedInstance.bluemixAppRoute! + "/user/login"
        let request = Request(url: customResourceURL, method: HttpMethod.GET)
        
        print("get to /user/login")
        let callBack: BMSCompletionHandler = {(response: Response?, error: NSError?) in
            if error == nil {
                print ("response :: \(response?.responseText), no error")
                if let newRequest = requestAfterLogin {
                    self.doRequest(newRequest, callback: callback)
                } else {
                    print ("error:: \(error.debugDescription)")
                }
            }
        }
        request.send(completionHandler: callBack)
    }
   
    static func handleError(_ error: NSError) {
        doHandleError("Communication Error", message: "\(error)", moveToRoot: moveToRootOnError)
    }
    
    static func handleServerError(_ data:Data, response: HTTPURLResponse) {
        let responseString = String(data: data, encoding: String.Encoding.utf8)
        let statusCode = response.statusCode
        doHandleError("Server Error", message: "Status Code: \(statusCode) - \(responseString!)", moveToRoot: false)
    }
    
    static func doHandleError(_ title:String, message: String, moveToRoot: Bool) {
        var vc: UIViewController?
        if var topController = UIApplication.shared.keyWindow?.rootViewController {
            while let presentedViewController = topController.presentedViewController {
                topController = presentedViewController
            }
            vc = topController
        } else {
            let window:UIWindow?? = UIApplication.shared.delegate?.window
            vc = window!!.rootViewController!
        }
        
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        let okAction = UIAlertAction(title: "OK", style: .cancel) { action -> Void in
            alert.removeFromParentViewController()
            if(moveToRoot){
                UIApplication.shared.cancelAllLocalNotifications()
                // reset view back to Get Started
                let storyboard = UIStoryboard(name: "Main", bundle: nil)
                let controller = storyboard.instantiateInitialViewController()! as UIViewController
                UIApplication.shared.windows[0].rootViewController = controller
            }
        }
        alert.addAction(okAction)
        
        DispatchQueue.main.async(execute: {
            vc!.present(alert, animated: true, completion: nil)
        })
    }
    
    static func getUUID() -> String {
        if let uuid = UserDefaults.standard.string(forKey: "iota-starter-uuid") {
            return uuid
        } else {
            let value = UUID().uuidString
            UserDefaults.standard.setValue(value, forKey: "iota-starter-uuid")
            return value
        }
    }

    // convert NSMutableURLRequest to BMSCore Request
    static fileprivate func toBMSRequest(_ request: NSMutableURLRequest) -> Request {
        let bmsRequest = Request(url: request.url!.absoluteString!, headers: request.allHTTPHeaderFields, queryParameters: request.allHTTPHeaderFields, method: HttpMethod(rawValue: request.httpMethod)!)
        print("toBMSRequest url: \(request.url!.absoluteString)")
        return bmsRequest
    }
    
    static fileprivate func toJsonArray(_ data: Data) -> [NSMutableDictionary] {
        var jsonArray: [NSMutableDictionary] = []
        do {
            if let tempArray:[NSMutableDictionary] = try JSONSerialization.jsonObject(with: data, options: [JSONSerialization.ReadingOptions.mutableContainers]) as? [NSMutableDictionary] {
                jsonArray = tempArray
            } else {
                if let temp = try JSONSerialization.jsonObject(with: data, options: JSONSerialization.ReadingOptions.mutableContainers) as? NSMutableDictionary {
                    jsonArray.append(temp)
                }
            }
        } catch {
            print("data returned wasn't array of json")
            /*
             do {
             if let temp = try NSJSONSerialization.JSONObjectWithData(data!, options: NSJSONReadingOptions.MutableContainers) as? NSDictionary {
             jsonArray[0] = temp
             }
             } catch {
             print("data returned wasn't json")
             }
             */
        }
        return jsonArray
    }

    static func doRequest(_ request: NSMutableURLRequest, callback: ((HTTPURLResponse, [NSDictionary]) -> Void)?) {
        print("\(request.httpMethod) to \(request.url!)")
        request.setValue(getUUID(), forHTTPHeaderField: "iota-starter-uuid")
        print("using UUID: \(getUUID())")
        
        if connectedMcaTenantId != "" {
            print("doRequest(BMS)")
            let bmsRequest = toBMSRequest(request)
            // Convert callback for NSURLSession dataTaskWithRequest(request) to callback for BMSCore sendWithCompletionHandler() or sendData()
            let bmsCallback: BMSCompletionHandler = {(response: Response?, error: NSError?) in
                if error == nil {
                    let nsResponse = HTTPURLResponse(url: request.url!, statusCode: response!.statusCode!, httpVersion: "HTTP/?.?", headerFields: response!.headers as! [String : String])!
                    
                    print("response = \(response!.statusCode!) \(response!.headers)")
                    
                    print("responseString = \(response!.responseText)")
                    
                    let jsonArray = toJsonArray(response!.responseData!)
                    
                    let statusCode = response!.statusCode
                    print("statusCode was \(statusCode)")
                    
                    switch statusCode! {
                    case 401:
                        fallthrough
                    case 500..<600:
                        self.handleServerError(response!.responseData!, response: nsResponse)
                        break
                    case 200..<400:
                        if !checkAPIVersion(nsResponse) {
                            doHandleError("API Version Error", message: "API version between the server and mobile app is inconsistent. Please upgrade your server or mobile app.", moveToRoot: true)
                            return;
                        }
                        fallthrough
                    default:
                        callback?(nsResponse, jsonArray)
                        moveToRootOnError = false
                    }
                } else {
                    print ("error: \(error.debugDescription)")
                }
            }
            if request.httpBody == nil {
                print("doRequest(BMS) no HTTPBody")
                bmsRequest.send(completionHandler: bmsCallback)
            } else {
                print("doRequest(BMS) HTTPBody \(NSString(data: request.httpBody!, encoding: String.Encoding.utf8.rawValue) as? String)")
                bmsRequest.send(requestBody: request.httpBody!, completionHandler: bmsCallback)
            }
        } else {
            let task = URLSession.shared.dataTask(with: request, completionHandler: { data, response, error in
                guard error == nil && data != nil else {
                    print("error=\(error!)")
                    handleError(error!)
                    return
                }
            
                print("response = \(response!)")
            
                let responseString = NSString(data: data!, encoding: String.Encoding.utf8)
                print("responseString = \(responseString!)")
            
                let jsonArray = toJsonArray(data!)
            
                let httpStatus = response as? HTTPURLResponse
                print("statusCode was \(httpStatus!.statusCode)")
            
                let statusCode = httpStatus?.statusCode
            
                switch statusCode! {
                case 401:
                self.login(request, callback: callback)
                break
                case 500..<600:
                self.handleServerError(data!, response: (response as? HTTPURLResponse)!)
                    break
                case 200..<400:
                    if !checkAPIVersion(response as! HTTPURLResponse)     {
                        doHandleError("API Version Error", message: "API version between the server and mobile app is inconsistent. Please upgrade your server or mobile app.", moveToRoot: true)
                        return;
                    }
                    fallthrough
                default:
                    callback?((response as? HTTPURLResponse)!, jsonArray)
                    moveToRootOnError = false
                }
             }) 
            task.resume()
        }
    }

    static func checkAPIVersion(_ response:HTTPURLResponse)->Bool{
        guard let apiVersion:String = response.allHeaderFields["iota-starter-car-sharing-version"] as? String else{
            print("Server API 1.0 is not supported")
            return false
        }
        let appVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as! String
        let splitedApiVersion = apiVersion.components(separatedBy: ".")
        let splitedAppVersion = appVersion.components(separatedBy: ".")
        return splitedApiVersion[0] == splitedAppVersion[0]
    }
    
    static func getLocation(_ lat: Double, lng: Double, label: UILabel) -> Void {
        let gc: CLGeocoder = CLGeocoder()
        let location = CLLocationCoordinate2D(latitude: lat, longitude: lng)
        gc.reverseGeocodeLocation(CLLocation(latitude: location.latitude, longitude: location.longitude), completionHandler: {
            (placemarks: [CLPlacemark]?, error: NSError?) -> Void in
            DispatchQueue.main.async(execute: {
                if (placemarks!.count > 0) {
                    let placemark = placemarks![0]
                    if placemark.name != nil && placemark.locality != nil {
                        let attrs = [
                            NSFontAttributeName : UIFont.systemFont(ofSize: 12.0),
                            NSForegroundColorAttributeName : UIColor.black.withAlphaComponent(0.6),
                            NSUnderlineStyleAttributeName : 1,
                        ] as [String : Any]
                        let text = "\(placemark.name!), \(placemark.locality!)"
                        let attributedText = NSAttributedString(string: text, attributes: attrs)
                        label.text = attributedText.string
                        label.attributedText = attributedText
                    } else {
                        // TODO: localize
                        label.text = "unknown location"
                    }
                    
                    label.textColor = UIColor.black.withAlphaComponent(0.6)
                    label.highlightedTextColor = UIColor.white
                }
            })
        } as! CLGeocodeCompletionHandler)
    }
}
