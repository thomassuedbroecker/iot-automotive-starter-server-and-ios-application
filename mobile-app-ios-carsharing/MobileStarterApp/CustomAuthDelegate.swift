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
import UIKit
import BMSCore
import BMSSecurity

private var currentContext: AuthenticationContext?
private var currentViewController: UIViewController?

// Auth delegate for handling custom challenge
class CustomAuthDelegate : AuthenticationDelegate {
    let defalutLoginPrompt = "This sample login demonstrates custom authentication capability of Mobile Client Access.\nFor this demo, you can enter any values to connect and use the app."

    func onAuthenticationChallengeReceived(_ authContext: AuthenticationContext, challenge: AnyObject) {
        print("onAuthenticationChallengeReceived challenge = \(challenge)")
        print("onAuthenticationChallengeReceived ----")
        currentContext = authContext
        var prompt = defalutLoginPrompt

        // re-challnege due to login failure
        let chal = challenge as! NSDictionary
        let chalText = chal["text"] as! String
        if chalText.hasPrefix("Login failed.") {
            print("re-challenge: \(chalText)")
            prompt = chalText
            DispatchQueue.main.async(execute: {
                self.dismissInProcessAlert(nil)
            })
        }

        DispatchQueue.main.async(execute: {
            currentViewController = self.getCurrentViewController()
        })
        DispatchQueue.main.async(execute: {
            self.showLoginAlert(prompt)
        })
    }

    func onAuthenticationSuccess(_ info: AnyObject?) {
        print("onAuthenticationSuccess info = \(info)")
        print("onAuthenticationSuccess ----")
        DispatchQueue.main.async(execute: {
            self.dismissInProcessAlert(nil)
        })
    }

    // should not been called.  should receive re-challenge.
    func onAuthenticationFailure(_ info: AnyObject?) {
        print("onAuthenticationFailure info = \(info)")
        print("onAuthenticationFailure ----")
        DispatchQueue.main.async(execute: {
            self.dismissInProcessAlert(self.showLoginFailureAlert)
        })
    }

    fileprivate func getViewController() -> UIViewController? {
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
        return vc
    }

    fileprivate func getCurrentViewController() -> UIViewController? {
        var cvc: UIViewController?
        let topController = UIApplication.shared.keyWindow?.rootViewController
        let vvc = (topController as! UINavigationController).visibleViewController

        if vvc is UITabBarController {
            cvc = (vvc as! UITabBarController).selectedViewController
        } else {
            // for example, MobilityStarterApp.CreateReservationViewController
            cvc = vvc
        }
        //print("current view controller: " + NSStringFromClass(cvc!.dynamicType))
        return cvc
    }
    
    fileprivate func setMessage(_ text: String) {
        if currentViewController is MessageViewController  {
            (currentViewController as! MessageViewController).setMessage(text)
        }
    }

    fileprivate struct InProcess {
        static var label = UILabel(frame: CGRect(x: 0, y: 0, width: 180, height: 100));
        static func setLabel() {
            self.label.center = CGPoint(x: 200, y: 280)
            self.label.textAlignment = NSTextAlignment.center
            self.label.textColor = UIColor.white
            self.label.font = UIFont.systemFont(ofSize: 24)
            self.label.text = "Certifying..."
        }

        static var activeIndicator = UIActivityIndicatorView()
        static func set() {
            self.activeIndicator.frame = CGRect(x: 0, y: 0, width: 50, height: 50)
            self.activeIndicator.hidesWhenStopped = false
            self.activeIndicator.activityIndicatorViewStyle = UIActivityIndicatorViewStyle.white
            self.activeIndicator.backgroundColor = UIColor.gray;
            self.activeIndicator.startAnimating()
        }
    }

    fileprivate var inProcessView = UIView(frame: UIScreen.main.bounds)
    fileprivate func setInProcessView() {
        inProcessView.backgroundColor = UIColor.gray
        inProcessView.alpha = 0.8 // transparency
        InProcess.setLabel()
        inProcessView.addSubview(InProcess.label)
        InProcess.set()
        InProcess.activeIndicator.center = inProcessView.center
        inProcessView.addSubview(InProcess.activeIndicator)
    }

    fileprivate func showInProcessAlert() {
        self.setInProcessView()
        getViewController()!.view.addSubview(inProcessView)
    }

    fileprivate func dismissInProcessAlert(_ completion: (()->Void)?) {
        DispatchQueue.main.async(execute: {
          self.inProcessView.removeFromSuperview()
        })
        if completion != nil {
            DispatchQueue.main.async(execute: {
                self.showLoginFailureAlert()
            })
        }
    }

    fileprivate func showLoginFailureAlert() {
        let message = "Login failed"
        DispatchQueue.main.async(execute: {
            self.setMessage(message)
            currentViewController = nil
        })
        let alertController = UIAlertController(title: "Error", message: message, preferredStyle: .alert)
        let okAction = UIAlertAction(title: "OK", style: .default) {
            action in
            // do nothing
        }
        alertController.addAction(okAction)
        getViewController()!.present(alertController, animated: true, completion: nil)
    }

    fileprivate func showLoginAlert(_ message: String) {
        var usernameTextField:UITextField?
        var passwordTextField:UITextField?

        let title = NSLocalizedString("IBM IoT for Automotive", comment: "")
        let cancelButtonTitle = NSLocalizedString("Cancel", comment: "")
        let okButtonTitle = NSLocalizedString("OK", comment: "")

        let alertController = UIAlertController(title: title, message: message, preferredStyle: .alert)

        // Add the text field
        alertController.addTextField { textField in
            usernameTextField = textField
            usernameTextField!.placeholder = NSLocalizedString("username", comment: "")
            usernameTextField!.isSecureTextEntry = false
        }

        // Add the text field for the secure text entry
        alertController.addTextField { textField in
            passwordTextField = textField
            passwordTextField?.placeholder = NSLocalizedString("password", comment: "")
            passwordTextField?.isSecureTextEntry = true
        }

        if let storedUserID = UserDefaults.standard.value(forKey: "userID") as? String {
            usernameTextField!.text = storedUserID
        }

        // Create the actions
        let cancelAction = UIAlertAction(title: cancelButtonTitle, style: .cancel) { action in
            print("The \"Login\" alert's cancel action occurred.")
            DispatchQueue.main.async(execute: {
                self.setMessage("Login canceled")
            })
            currentContext!.submitAuthenticationFailure(["Reason":"Login canceled"])
        }

        let okAction = UIAlertAction(title: okButtonTitle, style: .default) { action in
            print("Submitting auth... username:\(usernameTextField!.text)")
            DispatchQueue.main.async(execute: {
                self.showInProcessAlert()
            })
            currentContext!.submitAuthenticationChallengeAnswer(["username":usernameTextField!.text!, "password":passwordTextField!.text!])
        }

        // Add the actions
        alertController.addAction(cancelAction)
        alertController.addAction(okAction)
        getViewController()!.present(alertController, animated: true, completion: nil)
    }
}
