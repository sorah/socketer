require_relative './spec_helper'
require 'socketer/manager'
require 'tmpdir'
require 'tempfile'
require 'yaml'

describe Socketer::Manager do
  subject { described_class.new(token: 'foobar') }

  describe ".new" do
    it "accepts with token only" do
      expect { described_class.new(token: 'foobar') }.to_not raise_error
    end

    it "raises error with no arguments" do
      expect { described_class.new }.to raise_error(ArgumentError)
    end
  end

  describe "#install" do
    it "runs `npm install`" do
      subject.should_receive(:system).with(
        described_class::NPM, 'install').and_return(true)
      subject.install
    end

    it "runs in app_dir" do
      subject.should_receive(:system) do
        Dir.pwd.should == described_class::APP_DIR.to_s
        true
      end
      subject.install
    end

    context "when `npm install` failed" do
      it "raises InstallationFailed" do
        subject.should_receive(:system).and_return(false)
        expect { subject.install }.to raise_error(described_class::InstallationFailed)
      end
    end

    context "when npm specified" do
      subject { described_class.new(token: 'foobar', npm: "the_npm") }

      it "uses specified npm" do
        subject.should_receive(:system).with(
          "the_npm", 'install').and_return(true)
        subject.install
      end
    end
  end

  describe "#start" do
    before { class << subject; def stop; end; end }

    it "spawns app.js" do
      subject.should_receive(:spawn).with(
        described_class::NODE, described_class::APP,
        subject.app.to_s, subject.stream.to_s, subject.token, '1',
        out: STDOUT, err: STDERR)
      subject.start
    end

    it "spawns app.js in app_dir" do
      subject.should_receive(:spawn) do
        Dir.pwd.should == described_class::APP_DIR.to_s
        42
      end
      subject.start
    end

    it "sets pid" do
      subject.should_receive(:spawn) do
        42
      end

      subject.start
      subject.pid.should == 42
    end

    context "when manifest path specified" do
      let(:tmpfile) { Tempfile.new('manifest') }
      let(:tmppath) { tmpfile.path }
      subject { described_class.new(token: 'foobar', manifest: tmppath) }

      before do
        subject.stub(:spawn => nil)
        subject.start
      end

      it "writes manifest" do
        YAML.load_file(tmppath).should == {app: subject.app, stream: subject.stream,
                                           pid: subject.pid}
      end
    end

    context "when options specified" do
      let(:tmpdir) { Dir.mktmpdir }
      subject do
        described_class.new(token: 'foo', node: "the_node", app_dir: tmpdir,
                            app: 80, stream: 81, out: :a, err: :b)
      end

      it "changes argument for spawning app.js" do
        subject.should_receive(:spawn).with(
          "the_node", "app.js", "80", '81', 'foo', '1',
          out: :a, err: :b)

        subject.start
      end

      it "runs in specified directory" do
        subject.should_receive(:spawn) do
          Dir.pwd.should == File.realpath(tmpdir)
          42
        end

        subject.start
      end
    end

    context "when autostart is false" do
      subject do
        described_class.new(token: 'foo', autostart: false)
      end

      it "cuts off the last argument" do
        subject.should_receive(:spawn).with(
          described_class::NODE, described_class::APP,
          subject.app.to_s, subject.stream.to_s, subject.token,
          out: STDOUT, err: STDERR)
        subject.start
      end
    end
  end

  describe "#stop" do
    before do
      subject.stub(:spawn => 42)
      subject.start
    end

    it "sends INT to pid" do
      Process.should_receive(:kill).with(:INT, 42)
      subject.stub(:timeout => nil)

      subject.stop
    end

    it "waits 5 seconds to be app.js down, or kill it" do
      Process.should_receive(:kill).with(:INT, 42).ordered
      subject.should_receive(:timeout).with(5).ordered.and_raise(Timeout::Error)
      Process.should_receive(:kill).with(:KILL, 42).ordered

      subject.stop
    end

    it "resets pid to nil" do
      subject.pid.should == 42

      Process.stub(kill: nil)
      subject.stub(timeout: nil)
      subject.stop

      subject.pid.should be_nil
    end

    context "when manifest path specified" do
      let(:tmpfile) { Tempfile.new('manifest') }
      let(:tmppath) { tmpfile.path }
      subject { described_class.new(token: 'foobar', manifest: tmppath) }

      before do
        Process.stub(:kill => nil)
        subject.stub(:spawn => 42, :timeout => nil)
        subject.start
      end

      it "deletes manifest file" do
        Pathname.new(tmppath).should be_exist
        subject.stop
        Pathname.new(tmppath).should_not be_exist
      end
    end

    after { class << subject; def stop; end; end }
  end
end
