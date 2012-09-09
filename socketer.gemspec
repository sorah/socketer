# -*- encoding: utf-8 -*-
require File.expand_path('../lib/socketer/version', __FILE__)

Gem::Specification.new do |gem|
  gem.authors       = ["Shota Fukumori (sora_h)"]
  gem.email         = ["sorah@tubusu.net"]
  gem.description   = %q{TODO: Write a gem description}
  gem.summary       = %q{TODO: Write a gem summary}
  gem.homepage      = ""

  gem.files         = `git ls-files`.split($\)
  gem.executables   = gem.files.grep(%r{^bin/}).map{ |f| File.basename(f) }
  gem.test_files    = gem.files.grep(%r{^(test|spec|features)/})
  gem.name          = "socketer"
  gem.require_paths = ["lib"]
  gem.version       = Socketer::VERSION

  gem.add_dependency "msgpack"
  gem.add_development_dependency "rspec", "~> 2.11.0"
  gem.add_development_dependency "rake"
end
