require 'pathname'
require 'timeout'
require 'yaml'

class Socketer
  class Manager
    APP_DIR = Pathname.new(File.dirname(__FILE__)).join("..", "..", "js").expand_path
    APP = "app.js"
    NODE = "node"
    NPM = "npm"

    class InstallationFailed < Exception; end

    def initialize(options={})
      raise ArgumentError, "token required" unless options[:token]
      @node = options[:node] || NODE
      @npm = options[:npm] || NPM
      @app_dir = options[:app_dir] || APP_DIR
      @app = options[:app] || 8080
      @stream = options[:stream] || 8081
      @manifest = options[:manifest]
      @autostart = options.key?(:autostart) ? options[:autostart] : true
      @token = options[:token]

      @out = options[:out] || $stdout
      @err = options[:err] || $stderr

      @pid = nil

      at_exit { self.stop if @pid }
    end

    attr_reader :pid, :stream, :app, :token, :autostart

    def install
      Dir.chdir(@app_dir) do
        unless system(@npm, "install")
          raise InstallationFailed, "Whoa, something happened when installing node modules."
        end
      end
    end

    def start
      Dir.chdir(@app_dir) do
        args = [@app.to_s, @stream.to_s, @token]
        args << "1" if @autostart
        @pid = spawn(@node, APP, *args, out: @out, err: @err)

        if @manifest
          # File.write @manifest, {app: @app, stream: @stream, pid: @pid}.to_yaml
          open(@manifest, 'w'){|io| io.write({app: @app, stream: @stream, pid: @pid}.to_yaml) }
        end
      end
    end

    def stop
      return nil unless @pid
      Process.kill(:INT, @pid)
      begin
        timeout(5) { Process.waitpid(@pid) }
      rescue Errno::ESRCH
      rescue Timeout::Error
        begin
          Process.kill :KILL, @pid
        rescue Errno::ESRCH; end
      end
    ensure
      @pid = nil
      File.delete(@manifest) if @manifest && File.exist?(@manifest)
    end
  end
end
