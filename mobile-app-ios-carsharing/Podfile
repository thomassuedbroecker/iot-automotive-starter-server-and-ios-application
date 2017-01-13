# Uncomment this line to define a global platform for your project
# platform :ios, '9.0'

target 'MobilityStarterApp' do
  # Comment this line if you're not using Swift and don't want to use dynamic frameworks
  use_frameworks!

  # Pods for MobilityStarterApp
  pod 'BMSCore', '2.0.2'
  pod 'BMSSecurity', '2.0.2'
  pod 'BMSPush', '2.0.01'
  pod 'CocoaMQTT', '1.0.7'
end
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['SWIFT_VERSION'] = '2.3'
    end
  end
end
