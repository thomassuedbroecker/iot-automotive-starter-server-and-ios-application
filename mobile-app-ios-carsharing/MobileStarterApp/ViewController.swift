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
    static var mobileAppDeviceId: String = "d" + API.getUUID().substring(to: API.getUUID().characters.index(API.getUUID().startIndex, offsetBy: 30))
    static var behaviorDemo: Bool = false
    fileprivate static var needCredentials: Bool = false
    fileprivate static var tripID: String? = nil
    fileprivate static var userUnlocked: Bool = false
    fileprivate static var mqtt: CocoaMQTT?
    
    static func startDrive(_ deviceId: String)-> Bool{
        if(ViewController.mqtt == nil){
            return false
        }
        if(ViewController.reservationForMyDevice(deviceId)){
            ViewController.userUnlocked = true
            if(ViewController.tripID == nil){
                ViewController.tripID = UUID().uuidString
            }
        }
        return true
    }

    static func stopDrive(_ deviceId: String?){
        if(ViewController.reservationForMyDevice(deviceId)){
            ViewController.userUnlocked = false
        }
    }
    
    static func completeDrive(_ deviceId: String?){
        if(ViewController.reservationForMyDevice(deviceId)){
            ViewController.tripID = nil // clear the tripID
        }
    }
    
    static func getTripId(_ deviceId: String?) -> String? {
        if(ViewController.reservationForMyDevice(deviceId)){
            return ViewController.tripID
        }
        return nil
    }

    static func reservationForMyDevice(_ deviceId: String?) -> Bool {
        return ViewController.behaviorDemo && deviceId == ViewController.mobileAppDeviceId
    }
    
    func locationManager(_ manager: CLLocationManager, didUpdateToLocation newLocation: CLLocation, fromLocation oldLocation: CLLocation) {
        if (ViewController.behaviorDemo) {
            if (ViewController.mqtt == nil && ViewController.needCredentials) {
                let url = URL(string: "\(API.credentials)/\(ViewController.mobileAppDeviceId)?owneronly=true")!
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
                if(ViewController.mqtt!.connState == CocoaMQTTConnState.disconnected){
                    ViewController.mqtt?.connect()
                }else{
                    sendLocation(newLocation, oldLocation: oldLocation)
                }
            }
        }
    }
    
    func sendLocation(_ userLocation: CLLocation, oldLocation: CLLocation?) {
        if(ViewController.mqtt == nil || ViewController.mqtt!.connState != CocoaMQTTConnState.connected){
            return;
        }
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
        dateFormatter.timeZone = TimeZone(secondsFromGMT: 0)
        dateFormatter.locale = Locale(identifier: "en_US_POSIX")
        
        var data: [String: AnyObject] = [
            "speed": max(0, userLocation.speed * 60 * 60 / 1000),
            "lng": userLocation.coordinate.longitude,
            "lat": userLocation.coordinate.latitude,
            "ts": dateFormatter.string(from: Date()),
            "id": ViewController.mobileAppDeviceId,
            "status":  ViewController.tripID != nil ? "Unlocked" : "Locked"
        ]
        if(ViewController.tripID != nil){
            data["trip_id"] = ViewController.tripID as AnyObject?
        }else{
            // this trip should be completed, so lock device now
            ViewController.userUnlocked = false;
        }
        
        let stringData: String = jsonToString(data)
        
        ViewController.mqtt!.publish("iot-2/evt/sensorData/fmt/json", withString: stringData)
    }
    

    override func viewWillAppear(_ animated: Bool) {
        self.navigationController?.setNavigationBarHidden(true, animated: false)
        self.tabBarController?.tabBar.isHidden = true
        
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
        getStartedButton.layer.borderColor = UIColor.white.cgColor
        
        specifyServerButton.layer.borderWidth = 2
        specifyServerButton.layer.borderColor = UIColor.white.cgColor
        
        driverBehaviorButton.layer.borderWidth = 2
        driverBehaviorButton.layer.borderColor = UIColor.white.cgColor
        
        let version: String! = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as! String
        let build: String! = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as! String
        versionLabel.text = "Version: " + version + " Build: " + build
        
        self.navigationController?.navigationBar.barTintColor = Colors.dark
        self.navigationController?.navigationBar.tintColor = UIColor.white
        UINavigationBar.appearance().titleTextAttributes = [NSForegroundColorAttributeName : UIColor.white]
    }
    
    func jsonToString(_ data: [String: AnyObject]) -> String {
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
    
    @IBAction func getStartedAction(_ sender: AnyObject) {
        API.doInitialize()
        ViewController.behaviorDemo = false
        locationManager.requestWhenInUseAuthorization()
        locationManager.stopUpdatingLocation()
    }
    
    @IBAction func driverBehaviorDemoAction(_ sender: AnyObject) {
        API.doInitialize()
        ViewController.behaviorDemo = true
        ViewController.needCredentials = true
        if #available(iOS 9.0, *) {
            locationManager.allowsBackgroundLocationUpdates = true
        }
        locationManager.requestAlwaysAuthorization()
        locationManager.startUpdatingLocation()
    }
    
    override func prepare(for segue: UIStoryboardSegue, sender: Any?) {
        let target :UITabBarController? = segue.destination as? UITabBarController
        if(segue.identifier == "showHomeTab"){
            target?.viewControllers!.remove(at: 0) // Drive
            NotificationUtils.initRemoteNotification()
        } else if(segue.identifier == "showDriveTab"){
            target?.viewControllers!.remove(at: 1) // Home
            target?.viewControllers!.remove(at: 1) // Reservations
            let app = UIApplication.shared
            app.cancelAllLocalNotifications()
        }
    }


    func confirmDisclaimer() {
        let licenseVC: UIViewController = self.storyboard!.instantiateViewController(withIdentifier: "licenseViewController")
        licenseVC.modalPresentationStyle = .custom
        licenseVC.transitioningDelegate = self
        self.present(licenseVC, animated: true, completion: nil)
    }
    func presentationController(forPresented presented: UIViewController, presenting: UIViewController?, source: UIViewController) -> UIPresentationController? {
        return LicensePresentationController(presentedViewController: presented, presenting: presenting)
    }
}
class LicensePresentationController: UIPresentationController{
    fileprivate static let LICENSE_VIEW_MARGIN:CGFloat = 20
    var overlay: UIView!
    override func presentationTransitionWillBegin() {
        let containerView = self.containerView!
        self.overlay = UIVisualEffectView(effect: UIBlurEffect(style: .light))
        self.overlay.frame = containerView.bounds
        containerView.insertSubview(self.overlay, at: 0)
    }
    override func dismissalTransitionDidEnd(_ completed: Bool) {
        if completed {
            self.overlay.removeFromSuperview()
        }
    }
    override func size(forChildContentContainer container: UIContentContainer, withParentContainerSize parentSize: CGSize) -> CGSize {
        return CGSize(width: parentSize.width - LicensePresentationController.LICENSE_VIEW_MARGIN*2, height: parentSize.height - LicensePresentationController.LICENSE_VIEW_MARGIN*2)
    }
    override var frameOfPresentedViewInContainerView : CGRect {
        var presentedViewFrame = CGRect.zero
        let containerBounds = self.containerView!.bounds
        presentedViewFrame.size = self.size(forChildContentContainer: self.presentedViewController, withParentContainerSize: containerBounds.size)
        presentedViewFrame.origin.x = LicensePresentationController.LICENSE_VIEW_MARGIN
        presentedViewFrame.origin.y = LicensePresentationController.LICENSE_VIEW_MARGIN
        return presentedViewFrame
    }
    override func containerViewWillLayoutSubviews() {
        self.overlay.frame = self.containerView!.bounds
        self.presentedView!.frame = self.frameOfPresentedViewInContainerView
    }
}

extension ViewController: CocoaMQTTDelegate {
    
    func mqtt(_ mqtt: CocoaMQTT, didConnect host: String, port: Int) {
        print("didConnect \(host):\(port)")
    }
    
    func mqtt(_ mqtt: CocoaMQTT, didConnectAck ack: CocoaMQTTConnAck) {
        print("connected")
        sendLocation(locationManager.location!, oldLocation: nil) // initial location
        
        //print("didConnectAck \(ack.rawValue)")
        if ack == .accept {
            print("ACK")
        }
        
    }
    
    func mqtt(_ mqtt: CocoaMQTT, didPublishMessage message: CocoaMQTTMessage, id: UInt16) {
        print("didPublishMessage with message: \((message.string)!)")
    }
    
    func mqtt(_ mqtt: CocoaMQTT, didPublishAck id: UInt16) {
        print("didPublishAck with id: \(id)")
    }
    
    func mqtt(_ mqtt: CocoaMQTT, didReceiveMessage message: CocoaMQTTMessage, id: UInt16 ) {
        print("didReceivedMessage: \(message.string) with id \(id)")
    }
    
    func mqtt(_ mqtt: CocoaMQTT, didSubscribeTopic topic: String) {
        print("didSubscribeTopic to \(topic)")
    }
    
    func mqtt(_ mqtt: CocoaMQTT, didUnsubscribeTopic topic: String) {
        print("didUnsubscribeTopic to \(topic)")
    }
    
    func mqttDidPing(_ mqtt: CocoaMQTT) {
        print("didPing")
    }
    
    func mqttDidReceivePong(_ mqtt: CocoaMQTT) {
        _console("didReceivePong")
    }
    
    func mqttDidDisconnect(_ mqtt: CocoaMQTT, withError err: NSError?) {
        _console("mqttDidDisconnect")
    }
    
    func _console(_ info: String) {
        print("Delegate: \(info)")
    }
    
}
