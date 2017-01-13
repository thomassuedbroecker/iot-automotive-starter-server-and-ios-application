/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-ADRVKF&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps
 *
 * You may not use this file except in compliance with the license.
 */
import UIKit
import CoreLocation
import CocoaMQTT

class ViewController: UIViewController, CLLocationManagerDelegate, UIViewControllerTransitioningDelegate {
    @IBOutlet weak var smarterMobilityLabel : UILabel!
    @IBOutlet weak var specifyServerButton: UIButton!
    @IBOutlet weak var navigator: UINavigationItem!
    @IBOutlet weak var getStartedButton: UIButton!
    @IBOutlet weak var driverBehaviorButton: UIButton!
    @IBOutlet weak var versionLabel: UILabel!
    
    var locationManager = CLLocationManager()
    
    // drive using my device
    static var mobileAppDeviceId: String = "d" + API.getUUID().substringToIndex(API.getUUID().startIndex.advancedBy(30))
    static var behaviorDemo: Bool = false
    private static var needCredentials: Bool = false
    private static var tripID: String? = nil
    private static var userUnlocked: Bool = false
    private static var mqtt: CocoaMQTT?
    
    static func startDrive(deviceId: String)-> Bool{
        if(ViewController.mqtt == nil){
            return false
        }
        if(ViewController.reservationForMyDevice(deviceId)){
            ViewController.userUnlocked = true
            if(ViewController.tripID == nil){
                ViewController.tripID = NSUUID().UUIDString
            }
        }
        return true
    }

    static func stopDrive(deviceId: String?){
        if(ViewController.reservationForMyDevice(deviceId)){
            ViewController.userUnlocked = false
        }
    }
    
    static func completeDrive(deviceId: String?){
        if(ViewController.reservationForMyDevice(deviceId)){
            ViewController.tripID = nil // clear the tripID
        }
    }
    
    static func getTripId(deviceId: String?) -> String? {
        if(ViewController.reservationForMyDevice(deviceId)){
            return ViewController.tripID
        }
        return nil
    }

    static func reservationForMyDevice(deviceId: String?) -> Bool {
        return ViewController.behaviorDemo && deviceId == ViewController.mobileAppDeviceId
    }
    
    func locationManager(manager: CLLocationManager, didUpdateToLocation newLocation: CLLocation, fromLocation oldLocation: CLLocation) {
        if (ViewController.behaviorDemo) {
            if (ViewController.mqtt == nil && ViewController.needCredentials) {
                let url = NSURL(string: "\(API.credentials)/\(ViewController.mobileAppDeviceId)?owneronly=true")!
                let request = NSMutableURLRequest(URL: url)
                request.HTTPMethod = "GET"
                
                API.doRequest(request) { (httpResponse, jsonArray) -> Void in
                    if(ViewController.mqtt != nil){
                        // already got credentials
                        return;
                    }
                    if(jsonArray.count == 0){
                        self._console("Failed to get credential. May exceed free plan limit.")
                        ViewController.behaviorDemo = false;
                        return;
                    }
                    let deviceCredentials:NSDictionary = jsonArray[0]
                    
                    dispatch_sync(dispatch_get_main_queue(), {
                        print("calling mqttsettings")
                        
                        let clientIdPid = "d:\((deviceCredentials.objectForKey("org"))!):\((deviceCredentials.objectForKey("deviceType"))!):\((deviceCredentials.objectForKey("deviceId"))!)"
                        ViewController.mqtt = CocoaMQTT(clientId: clientIdPid, host: "\((deviceCredentials.objectForKey("org"))!).messaging.internetofthings.ibmcloud.com", port: 8883)
                        
                        if let mqtt = ViewController.mqtt {
                            mqtt.username = "use-token-auth"
                            mqtt.password = deviceCredentials.objectForKey("token") as? String
                            mqtt.keepAlive = 90
                            mqtt.delegate = self
                            mqtt.secureMQTT = true
                        }
                        
                        ViewController.mqtt?.connect()

                    })
                }
                ViewController.needCredentials = false
            }
            
            if (ViewController.mqtt != nil && ViewController.userUnlocked){
                if(ViewController.mqtt!.connState == CocoaMQTTConnState.DISCONNECTED){
                    ViewController.mqtt?.connect()
                }else{
                    sendLocation(newLocation, oldLocation: oldLocation)
                }
            }
        }
    }
    
    func sendLocation(userLocation: CLLocation, oldLocation: CLLocation?) {
        if(ViewController.mqtt == nil || ViewController.mqtt!.connState != CocoaMQTTConnState.CONNECTED){
            return;
        }
        let dateFormatter = NSDateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
        dateFormatter.timeZone = NSTimeZone(forSecondsFromGMT: 0)
        dateFormatter.locale = NSLocale(localeIdentifier: "en_US_POSIX")
        
        var data: [String: AnyObject] = [
            "speed": max(0, userLocation.speed * 60 * 60 / 1000),
            "lng": userLocation.coordinate.longitude,
            "lat": userLocation.coordinate.latitude,
            "ts": dateFormatter.stringFromDate(NSDate()),
            "id": ViewController.mobileAppDeviceId,
            "status":  ViewController.tripID != nil ? "Unlocked" : "Locked"
        ]
        if(ViewController.tripID != nil){
            data["trip_id"] = ViewController.tripID
        }else{
            // this trip should be completed, so lock device now
            ViewController.userUnlocked = false;
        }
        
        let stringData: String = jsonToString(data)
        
        ViewController.mqtt!.publish("iot-2/evt/sensorData/fmt/json", withString: stringData)
    }
    

    override func viewWillAppear(animated: Bool) {
        self.navigationController?.setNavigationBarHidden(true, animated: false)
        self.tabBarController?.tabBar.hidden = true
        
        UITabBar.appearance().tintColor = UIColor(red: 65/255, green: 120/255, blue: 190/255, alpha: 1)
        
        super.viewWillAppear(animated)
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()

        confirmDisclaimer();
        
        // Set title border
        let smarterMobilityText = NSAttributedString(
            string: "IBM IoT for Automotive",
            attributes: [NSStrokeColorAttributeName: Colors.dark,
                        NSStrokeWidthAttributeName: -1.0])
        smarterMobilityLabel.attributedText = smarterMobilityText
        
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        
        view.backgroundColor = Colors.dark
        
        getStartedButton.layer.borderWidth = 2
        getStartedButton.layer.borderColor = UIColor.whiteColor().CGColor
        
        specifyServerButton.layer.borderWidth = 2
        specifyServerButton.layer.borderColor = UIColor.whiteColor().CGColor
        
        driverBehaviorButton.layer.borderWidth = 2
        driverBehaviorButton.layer.borderColor = UIColor.whiteColor().CGColor
        
        let version: String! = NSBundle.mainBundle().objectForInfoDictionaryKey("CFBundleShortVersionString") as! String
        let build: String! = NSBundle.mainBundle().objectForInfoDictionaryKey("CFBundleVersion") as! String
        versionLabel.text = "Version: " + version + " Build: " + build
        
        self.navigationController?.navigationBar.barTintColor = Colors.dark
        self.navigationController?.navigationBar.tintColor = UIColor.whiteColor()
        UINavigationBar.appearance().titleTextAttributes = [NSForegroundColorAttributeName : UIColor.whiteColor()]
    }
    
    func jsonToString(data: [String: AnyObject]) -> String {
        var temp: String = "{\"d\":{"
        var accum: Int = 0
        
        for i in data {
            if accum == (data.count - 1) {
                temp += "\"\(i.0)\": \"\(i.1)\"}}"
            } else {
                temp += "\"\(i.0)\": \"\(i.1)\", "
            }
            
            accum += 1
        }
        
        return temp
    }
    
    @IBAction func getStartedAction(sender: AnyObject) {
        API.doInitialize()
        ViewController.behaviorDemo = false
        locationManager.requestWhenInUseAuthorization()
        locationManager.stopUpdatingLocation()
    }
    
    @IBAction func driverBehaviorDemoAction(sender: AnyObject) {
        API.doInitialize()
        ViewController.behaviorDemo = true
        ViewController.needCredentials = true
        if #available(iOS 9.0, *) {
            locationManager.allowsBackgroundLocationUpdates = true
        }
        locationManager.requestAlwaysAuthorization()
        locationManager.startUpdatingLocation()
    }
    
    override func prepareForSegue(segue: UIStoryboardSegue, sender: AnyObject?) {
        let target :UITabBarController? = segue.destinationViewController as? UITabBarController
        if(segue.identifier == "showHomeTab"){
            target?.viewControllers!.removeAtIndex(0) // Drive
            NotificationUtils.initRemoteNotification()
        } else if(segue.identifier == "showDriveTab"){
            target?.viewControllers!.removeAtIndex(1) // Home
            target?.viewControllers!.removeAtIndex(1) // Reservations
            let app = UIApplication.sharedApplication()
            app.cancelAllLocalNotifications()
        }
    }


    func confirmDisclaimer() {
        let licenseVC: UIViewController = self.storyboard!.instantiateViewControllerWithIdentifier("licenseViewController")
        licenseVC.modalPresentationStyle = .Custom
        licenseVC.transitioningDelegate = self
        self.presentViewController(licenseVC, animated: true, completion: nil)
    }
    func presentationControllerForPresentedViewController(presented: UIViewController, presentingViewController presenting: UIViewController?, sourceViewController source: UIViewController) -> UIPresentationController? {
        return LicensePresentationController(presentedViewController: presented, presentingViewController: presenting)
    }
}
class LicensePresentationController: UIPresentationController{
    private static let LICENSE_VIEW_MARGIN:CGFloat = 20
    var overlay: UIView!
    override func presentationTransitionWillBegin() {
        let containerView = self.containerView!
        self.overlay = UIVisualEffectView(effect: UIBlurEffect(style: .Light))
        self.overlay.frame = containerView.bounds
        containerView.insertSubview(self.overlay, atIndex: 0)
    }
    override func dismissalTransitionDidEnd(completed: Bool) {
        if completed {
            self.overlay.removeFromSuperview()
        }
    }
    override func sizeForChildContentContainer(container: UIContentContainer, withParentContainerSize parentSize: CGSize) -> CGSize {
        return CGSize(width: parentSize.width - LicensePresentationController.LICENSE_VIEW_MARGIN*2, height: parentSize.height - LicensePresentationController.LICENSE_VIEW_MARGIN*2)
    }
    override func frameOfPresentedViewInContainerView() -> CGRect {
        var presentedViewFrame = CGRectZero
        let containerBounds = self.containerView!.bounds
        presentedViewFrame.size = self.sizeForChildContentContainer(self.presentedViewController, withParentContainerSize: containerBounds.size)
        presentedViewFrame.origin.x = LicensePresentationController.LICENSE_VIEW_MARGIN
        presentedViewFrame.origin.y = LicensePresentationController.LICENSE_VIEW_MARGIN
        return presentedViewFrame
    }
    override func containerViewWillLayoutSubviews() {
        self.overlay.frame = self.containerView!.bounds
        self.presentedView()!.frame = self.frameOfPresentedViewInContainerView()
    }
}

extension ViewController: CocoaMQTTDelegate {
    
    func mqtt(mqtt: CocoaMQTT, didConnect host: String, port: Int) {
        print("didConnect \(host):\(port)")
    }
    
    func mqtt(mqtt: CocoaMQTT, didConnectAck ack: CocoaMQTTConnAck) {
        print("connected")
        sendLocation(locationManager.location!, oldLocation: nil) // initial location
        
        //print("didConnectAck \(ack.rawValue)")
        if ack == .ACCEPT {
            print("ACK")
        }
        
    }
    
    func mqtt(mqtt: CocoaMQTT, didPublishMessage message: CocoaMQTTMessage, id: UInt16) {
        print("didPublishMessage with message: \((message.string)!)")
    }
    
    func mqtt(mqtt: CocoaMQTT, didPublishAck id: UInt16) {
        print("didPublishAck with id: \(id)")
    }
    
    func mqtt(mqtt: CocoaMQTT, didReceiveMessage message: CocoaMQTTMessage, id: UInt16 ) {
        print("didReceivedMessage: \(message.string) with id \(id)")
    }
    
    func mqtt(mqtt: CocoaMQTT, didSubscribeTopic topic: String) {
        print("didSubscribeTopic to \(topic)")
    }
    
    func mqtt(mqtt: CocoaMQTT, didUnsubscribeTopic topic: String) {
        print("didUnsubscribeTopic to \(topic)")
    }
    
    func mqttDidPing(mqtt: CocoaMQTT) {
        print("didPing")
    }
    
    func mqttDidReceivePong(mqtt: CocoaMQTT) {
        _console("didReceivePong")
    }
    
    func mqttDidDisconnect(mqtt: CocoaMQTT, withError err: NSError?) {
        _console("mqttDidDisconnect")
    }
    
    func _console(info: String) {
        print("Delegate: \(info)")
    }
    
}
