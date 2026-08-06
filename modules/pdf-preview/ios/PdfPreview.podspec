Pod::Spec.new do |s|
  s.name           = 'PdfPreview'
  s.version        = '1.0.0'
  s.summary        = 'Renders pages of a local PDF for the book import screen.'
  s.description    = 'Renders pages of a local PDF for the book import screen.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'PDFKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,swift}"
end
